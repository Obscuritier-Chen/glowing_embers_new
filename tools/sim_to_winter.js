#!/usr/bin/env node
/* 无界面自动模拟：从开局打到「长冬将至」，期间真实调用 AI 导演并记录它注入的全部内容。
   只依赖 Node ≥ 18（全局 fetch），不改动游戏代码：用 vm 加载 index.html 里列出的脚本，自动玩家 + 自定义 provider。

   用法：
     OPENROUTER_API_KEY=sk-... node tools/sim_to_winter.js --model google/gemini-4-hydrogen
     node tools/sim_to_winter.js --mock                       # 不调用网络，用内置假 AI 验证流程（零成本）
   参数：
     --model <id>        模型（默认取环境变量 MODEL）
     --endpoint <url>    默认 https://openrouter.ai/api/v1/chat/completions
     --seed <n>          随机种子（默认 1）；同种子下自动玩家的决策可复现
     --bias <tech|magic|faith|random>  自动玩家选 AI 事件选项时偏向的路线（默认 random）
     --max-days <n>      最长模拟游戏日数（默认 25）；--max-real <sec> 真实时间上限（默认 1200）
     --period-days <n>   AI 周期请求间隔（默认 2）；--save-context 额外保存每次请求的上下文
     --out <dir>         输出目录（默认 tools/out/sim_<时间>）
   输出：ai_calls.jsonl（AI 原始工具调用）、ai_events.md（可读转译）、run.json（选择、轴变化、token/费用汇总）
   节奏：AI 请求在途时游戏时间暂停（保证每次请求的事件都会真实出现并被记录）。 */
'use strict';
// Node 的 fetch 默认不走系统/环境代理；检测到 HTTPS_PROXY 时自动带 NODE_USE_ENV_PROXY=1 重启自己（否则可能因地区限制 403）
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = require('child_process').spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: '1' }) });
  process.exit(r.status === null ? 1 : r.status);
}
const fs = require('fs'), path = require('path'), vm = require('vm');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opt[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
const ROOT = path.resolve(__dirname, '..');
const MODEL = opt.model || process.env.MODEL || 'google/gemini-4-hydrogen';
const ENDPOINT = opt.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
const KEY = process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const MOCK = !!opt.mock;
const SEED = +opt.seed || 1, MAX_DAYS = +opt['max-days'] || 25, MAX_REAL = (+opt['max-real'] || 1200) * 1000;
const BIAS = opt.bias || 'random';
if (!MOCK && !KEY) { console.error('缺少 OPENROUTER_API_KEY 环境变量（或使用 --mock）。'); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(opt.out || path.join(ROOT, 'tools', 'out', 'sim_' + stamp));
fs.mkdirSync(OUT, { recursive: true });

/* ---------- 可复现随机 ---------- */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const SMath = Object.create(Math); SMath.random = rng;

/* ---------- 加载游戏（脚本顺序取自 index.html，内容增补后无需改本脚本） ---------- */
const store = {};
const ctx = {
  console, Math: SMath, Date, JSON, URLSearchParams, AbortController, fetch, setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval() {}, performance: { now: () => Date.now() },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  location: { search: '' },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, body: { classList: { toggle() {} } } },
};
ctx.window = ctx; ctx.addEventListener = () => {};
vm.createContext(ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
for (const src of scripts) {
  if (src === 'js/engine/ai.js') vm.runInContext(`Game.cfg.ai = Object.assign({ minGapMs: ${MOCK ? 20 : 800}, periodDays: ${+opt['period-days'] || 2} }, Game.cfg.ai || {});`, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src });
}
const G = ctx.Game, A = ctx.GameAI;
G.S = G.newState(); G.boot(); G.S.ev.done.intro = true;

/* ---------- AI provider：真实调用 / 假 AI ---------- */
const calls = [], usage = { prompt: 0, completion: 0, cost: 0, requests: 0 };
const wait = ms => new Promise(r => setTimeout(r, ms));
let t0 = Date.now();

async function realProvider(req) {
  const body = { model: MODEL, tool_choice: 'auto', usage: { include: true }, tools: req.tools.map(t => ({ type: 'function', function: t })),
    messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] };
  let lastErr;
  for (let k = 0; k < 2; k++) {
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY, 'HTTP-Referer': 'http://localhost', 'X-Title': 'glowing-embers-sim' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
      const j = await r.json(), m = (j.choices || [{}])[0].message || {};
      if (j.usage) { usage.prompt += j.usage.prompt_tokens || 0; usage.completion += j.usage.completion_tokens || 0; usage.cost += j.usage.cost || 0; }
      const out = (m.tool_calls || []).map(c => ({ name: c.function.name, input: c.function.arguments }));
      if (!out.length && m.content) { const mm = String(m.content).match(/\{[\s\S]*\}/); if (mm) out.push({ name: 'inject_event', input: mm[0] }); }
      return out;
    } catch (e) { lastErr = e; await wait(1500); }
  }
  throw lastErr;
}
let mockN = 0;
async function mockProvider(req) {
  const c = req.context, n = ++mockN, ro = r => ({ resource_deltas: r });
  await wait(30);
  if (req.reason === 'compress_memory') return [{ name: 'update_memory', input: { macro_summary: '（mock）聚落在荒原上站稳了脚跟。', truth_fragments: ['（mock）旧世钻探'] } }];
  if (req.reason === 'foundation_projects') return c.world_meta.unlocked_routes.map(r => ({ name: 'set_project_flavor', input: { project_id: { tech: 'steam_core', magic: 'alchemy_hall', faith: 'vigil_altar' }[r], description: '（mock）带着第一阶段记忆的工程。' } }));
  return [{ name: 'inject_event', input: { event_type: req.reason.startsWith('exploration') ? 'exploration' : 'single', title: '（mock）荒原来客 #' + n, narrative_text: '风里传来脚步声。', options: [
    Object.assign({ label: '工程实证', hint_text: 'mock', hidden_axis_deltas: { alignment_tech: 3 } }, ro({ wood: -5, notes: 3 })),
    Object.assign({ label: '触媒秘仪', hint_text: 'mock', hidden_axis_deltas: { alignment_magic: 3 } }, ro({ pale_ash: -3, notes: 3 })),
    Object.assign({ label: '虔信守望', hint_text: 'mock', hidden_axis_deltas: { alignment_religion: 3 } }, ro({ food: -3, population_total: 1 })) ] } }];
}
A.setProvider(async req => {
  const t = Date.now(); usage.requests++;
  const out = await (MOCK ? mockProvider(req) : realProvider(req));
  const rec = { seq: calls.length + 1, at_sec: Math.round((t - t0) / 1000), latency_ms: Date.now() - t, reason: req.reason, day: G.env().day, model: MOCK ? 'mock' : MODEL,
    tool_calls: out.map(c => ({ name: c.name, input: typeof c.input === 'string' ? safeJSON(c.input) : c.input })) };
  if (opt['save-context']) rec.context = req.context;
  calls.push(rec); fs.appendFileSync(path.join(OUT, 'ai_calls.jsonl'), JSON.stringify(rec) + '\n');
  log(`AI #${rec.seq} [${req.reason}] → ${out.map(c => c.name).join(', ') || '（空）'} (${rec.latency_ms}ms)`);
  return out;
});
function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return { _unparsed: s }; } }
const log = m => console.log(`[day ${String(G.env().day).padStart(2)} | ${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);

/* ---------- 记录：玩家选择、AI 事件译文、轴变化 ---------- */
const choices = [], timeline = [], seenEvents = new Set(), translated = {};
G.on('choice', c => { const ev = G.def('events', c.eventId); choices.push({ day: G.env().day, ai: !!(ev && ev.ai), event: c.title, choice: c.label }); log(`选择 ${ev && ev.ai ? '[AI] ' : ''}「${c.title}」→ ${c.label}`); });
function snapshotNewEvents() {
  for (const [id, e] of Object.entries(G.S.dyn.events)) if (!seenEvents.has(id)) { seenEvents.add(id); translated[id] = JSON.parse(JSON.stringify(e)); }
}

/* ---------- 自动玩家（与浏览器调试时使用的策略一致） ---------- */
function pickChoice(ev) {
  const ok = ev.choices.map((c, i) => [c, i]).filter(([c]) => G.choiceOk(c));
  if (!ok.length) return -1;
  if (BIAS !== 'random' && ev.ai) {
    const key = { tech: 'tech', magic: 'magic', faith: 'faith' }[BIAS];
    ok.sort((a, b) => ((b[0].effects.align || {})[key] || 0) - ((a[0].effects.align || {})[key] || 0));
    return ok[0][1];
  }
  return ok[Math.floor(rng() * ok.length)][1];
}
const bOrder = [['hut', s => s.pop >= G.D.housing - 1], ['forager_camp', s => (s.bld.forager_camp || 0) < 1], ['quarry', s => (s.bld.quarry || 0) < 1], ['drafting_table', s => s.pop >= 3],
  ['field', s => (s.bld.field || 0) < 2], ['woodshed', s => (s.res.wood || 0) >= 95], ['coal_pit', s => !s.bld.coal_pit], ['windmill', s => !s.bld.windmill], ['smithy', s => !s.bld.smithy],
  ['stone_row', s => (s.bld.stone_row || 0) < 1], ['town_hall', s => !s.bld.town_hall]];
const jobOrder = ['scholar', 'farmer', 'forager', 'woodcutter', 'quarryman', 'miner', 'smith'];
const resOrder = ['scouting', 'prospecting', 'three_field', 'wind_power', 'guild_arch', 'smelting', 'relic_study'];
function decide() {
  const S = G.S;
  for (const id of ['light_fire', 'gather_wood', 'forage', 'scoop_ash', 'dig_stone']) { const a = G.def('actions', id); if (a && G.actionOk(a)) G.doAction(id); }
  for (const [id, cond] of bOrder) { const b = G.def('buildings', id); if (b && G.buildingVisible(b) && cond(S) && G.canBuild(b)) { G.build(id); break; } }
  for (const j of jobOrder) while (G.idle() > 0 && (G.D.slots[j] || 0) > (S.jobs[j] || 0) && !(j === 'smith' && (S.res.coal || 0) < 5)) G.setJob(j, 1);
  if (!S.research.current) for (const r of resOrder) { const d = G.def('research', r); if (d && G.researchAvailable(d) && (S.research.progress[r] !== undefined || G.canPay(d.cost))) { G.startResearch(r); break; } }
  if (S.research.done.scouting && !S.exps.length && G.idle() >= 2 && (S.res.food || 0) > 40)
    for (const id of ['rail_shed', 'dead_wood']) { const nd = G.def('nodes', id); if (nd && G.nodeVisible(nd)) { G.startExpedition(id, 2); break; } }
  for (const e of S.exps) if (e.phase === 'at') { const nd = G.def('nodes', e.node); G.expAction(e.id, G.nodeState(e.node).p < 100 && e.supply >= (nd.searchCost || 1) * e.members ? 'search' : 'back'); }
}

/* ---------- 主循环 ---------- */
(async () => {
  log(`开始模拟：${MOCK ? 'mock AI' : MODEL}，种子 ${SEED}，输出 ${path.relative(ROOT, OUT)}`);
  let n = 0, stop = '';
  while (!stop) {
    const S = G.S;
    if (S.ev.active) {
      const a = S.ev.active, ev = G.def('events', a.id);
      if (a.id === 'winter_crossroads' && a.result === null) { stop = '到达「长冬将至」'; break; }
      if (a.result === null) { const i = pickChoice(ev); G.choose(i >= 0 ? i : ev.choices.length - 1); } else G.closeEvent();
      snapshotNewEvents(); continue;
    }
    if (A.status().inFlight) { await wait(100); continue; }            // 等 AI：游戏时间暂停
    if (G.env().day > MAX_DAYS) { stop = '超过最大游戏日数'; break; }
    if (Date.now() - t0 > MAX_REAL) { stop = '超过真实时间上限'; break; }
    G.advance(1.5); n++;
    if (n % 5 === 0) { decide(); if (n % 40 === 0) timeline.push({ day: G.env().day, pop: S.pop, axes: Object.assign({}, S.axes), align: Object.assign({}, S.align) }); }
    snapshotNewEvents();
    if (n % 20 === 0) await wait(0);
    if (A.status().fails >= 3) { stop = 'AI 连续失败 3 次：' + A.status().error; break; }
  }
  snapshotNewEvents();
  finish(stop);
})().catch(e => { console.error(e); process.exit(2); });

/* ---------- 输出 ---------- */
const AXN = { alignment_tech: '科技', alignment_magic: '魔法', alignment_religion: '宗教', settlement_cohesion: '凝聚', pragmatism_vs_empathy: '温情(+)/功利(−)', ash_assimilation_depth: '白灰同化', narrative_tension: '张力' };
const sg = n => (n > 0 ? '+' : '') + n;
function renderOption(o, i) {
  const L = [`${i + 1}. **${o.label}**${o.hint_text ? `　_${o.hint_text}_` : ''}`];
  const req = o.requirements || {}; const rq = [];
  for (const k in req.resources || {}) rq.push(`${k}≥${req.resources[k]}`); for (const k in req.min_job || {}) rq.push(`岗位${k}≥${req.min_job[k]}`); if (req.min_pop) rq.push(`人口≥${req.min_pop}`);
  if (rq.length) L.push(`   - 条件：${rq.join('，')}`);
  const rd = Object.entries(o.resource_deltas || {}).map(([k, v]) => `${k} ${sg(v)}`); if (rd.length) L.push(`   - 资源：${rd.join('，')}`);
  const ax = Object.entries(o.hidden_axis_deltas || {}).map(([k, v]) => `${AXN[k] || k} ${sg(v)}`); if (ax.length) L.push(`   - 隐式轴：${ax.join('，')}`);
  for (const b of o.buffs || []) L.push(`   - buff：${typeof b === 'string' ? b : `${b.name}（${b.duration || '永久'}s）${JSON.stringify(b.effects)}`}`);
  if (o.grant_relic) L.push(`   - 遗物：${o.grant_relic.name}——${o.grant_relic.description || ''}`);
  if (o.follow_up_directive) L.push(`   - 后续：${JSON.stringify(o.follow_up_directive)}`);
  if (o.result_text) L.push(`   - 结果文字：${o.result_text}`);
  return L.join('\n');
}
function finish(stop) {
  const S = G.S, md = [`# AI 注入记录\n\n- 模型：${MOCK ? 'mock' : MODEL}　种子：${SEED}　停止原因：${stop}\n- 游戏日：${G.env().day}　人口：${S.pop}　AI 请求：${usage.requests}次　tokens：${usage.prompt}+${usage.completion}　费用：$${usage.cost.toFixed(4)}\n`];
  for (const c of calls) {
    md.push(`\n---\n\n## 请求 #${c.seq} · ${c.reason}（第${c.day}天，${c.latency_ms}ms）`);
    for (const t of c.tool_calls) {
      const p = t.input || {};
      if (t.name === 'inject_event') {
        md.push(`\n### 「${p.title}」　\`${p.event_type}\`${p.chain_id ? '　链 ' + p.chain_id : ''}\n\n${p.narrative_text}\n\n${(p.options || []).map(renderOption).join('\n')}`);
        if (p.director_internal_thought) md.push(`\n> 导演内心：${p.director_internal_thought}`);
      } else md.push(`\n### 工具 \`${t.name}\`\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``);
    }
  }
  md.push('\n---\n\n## 引擎翻译后的事件（含钳制结果）\n');
  for (const e of Object.values(translated)) md.push(`- \`${e.id}\`（${e.aiType}）：${e.choices.map(c => `${c.text}${c.cost ? ' 代价' + JSON.stringify(c.cost) : ''}${c.effects.res && Object.keys(c.effects.res).length ? ' 收益' + JSON.stringify(c.effects.res) : ''}`).join(' ｜ ')}`);
  fs.writeFileSync(path.join(OUT, 'ai_events.md'), md.join('\n'));
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ stop, model: MOCK ? 'mock' : MODEL, seed: SEED, bias: BIAS, day: G.env().day, pop: S.pop, usage, realSec: Math.round((Date.now() - t0) / 1000),
    aiStatus: A.status(), choices, timeline, axes: S.axes, align: S.align, chains: S.director.chains, memory: S.director.memory, translatedEvents: translated, dyn: { buffs: S.dyn.buffs, resources: S.dyn.resources, projects: S.dyn.projects } }, null, 2));
  log(`完成：${stop}`);
  console.log(`  AI 请求 ${usage.requests} 次，注入事件 ${Object.keys(translated).length} 个，tokens ${usage.prompt}+${usage.completion}，费用 $${usage.cost.toFixed(4)}`);
  console.log(`  输出：${OUT}`);
  process.exit(0);
}
