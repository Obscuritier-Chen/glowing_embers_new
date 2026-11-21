/* 余烬微光 —— AI 叙事导演接口（参考 AI_DIRECTOR_DESIGN.md，纯前端实现）
   游戏保持完全在浏览器内运行，因此文档里的 HTTP 接口被实现为浏览器内的 JS API：
     GameAI.getContext()        ≙ GET  /api/game/context      导出状态与故事线
     GameAI.injectEvent(json)   ≙ POST /api/game/inject_event 注入事件（校验 + 数值钳制 + DSL 翻译）
     GameAI.handleToolCall(name, input)  统一的工具入口：inject_event / update_memory / adjust_axes / set_project_flavor
   外部 AI 有三种接入方式：
     1) 内置导演客户端：面板里配置 OpenAI 兼容 / Anthropic 接口，浏览器直连（密钥只存本机 localStorage）
     2) GameAI.setProvider(async req => toolCalls)  自带适配器（本地模型、自建代理、扩展脚本等）
     3) window.postMessage 桥（面板里开启）：外部页面/扩展发 {type:'glowing_embers:get_context'} 与 {type:'glowing_embers:tool_call',name,input}
   AI 不可用时，静态事件池自动兜底。 */
(function (G) {
  'use strict';
  const SETTINGS_KEY = 'glowing_embers_ai_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = s => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };

  /* ---------- 配置与设置 ---------- */
  const CFG = Object.assign({ poolTarget: 1, poolMax: 2, periodDays: 3, minGameGap: 60, compressDays: 15, eventGap: 90, fallbackAfter: 150, minGapMs: 8000, timeoutMs: 40000, fuel: 'wood',
    stageNames: { 1: '基本生存阶段', 2: '文明发展阶段', 3: '真相探索阶段' },
    season: d => ['初春', '盛夏', '深秋', '长冬'][Math.floor((d - 1) / 20) % 4],
    alias: { pale_ash: 'ash', refined_iron: 'iron', research_notes: 'notes', population_total: '$pop' } }, G.cfg.ai || {});
  const settings = Object.assign({ enabled: false, type: 'openai', endpoint: '', model: '', key: '', bridge: false }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 忽略 */ } };

  const st = { inFlight: false, lastReqAt: 0, fails: 0, error: '', lastTitle: '', provider: null, log: [], pendingReason: null };
  const note = m => { st.log.unshift(new Date().toLocaleTimeString() + ' ' + m); if (st.log.length > 30) st.log.length = 30; };

  /* ---------- 数值边界（Value Clamping Sandbox） ---------- */
  const LIMITS = {
    single:     { res: 0.25, pop: 2, axis: 6,  pct: 0.3, dur: 600,  perm: false },
    exploration:{ res: 0.35, pop: 2, axis: 8,  pct: 0.3, dur: 600,  perm: false },
    chain_step: { res: 0.35, pop: 3, axis: 10, pct: 0.4, dur: 900,  perm: true },
    milestone:  { res: 0.5,  pop: 5, axis: 15, pct: 0.5, dur: 1800, perm: true },
  };
  const limitsFor = t => LIMITS[t] || LIMITS.single;
  const AXIS = { alignment_tech: ['align', 'tech'], alignment_magic: ['align', 'magic'], alignment_religion: ['align', 'faith'],
    settlement_cohesion: ['axes', 'cohesion'], pragmatism_vs_empathy: ['axes', 'empathy'], ash_assimilation_depth: ['axes', 'assimilation'], narrative_tension: ['axes', 'tension'] };
  const resId = k => { const a = CFG.alias[k] || k; return a === '$pop' ? '$pop' : (G.def('resources', a) ? a : null); };

  /* ---------- 上下文导出（GameContextPayload） ---------- */
  function getContext(reason) {
    const S = G.S, env = G.env(), D = S.director, dl = G.cfg.dayLength || 120;
    const stock = {}, bottlenecks = [], days = {};
    for (const r of G.list('resources')) {
      if (!S.seen[r.id] || r.group === 'relic') continue;
      const amt = S.res[r.id] || 0; stock[r.id] = Math.round(amt);
      const net = G.rates(r.id).reduce((a, x) => a + x.rate, 0);
      if (net < -1e-6 && amt > 0) { days[r.id] = Math.round(amt / -net / dl * 10) / 10; if (days[r.id] < 3) bottlenecks.push(`${r.name}即将耗尽（约${days[r.id]}天）`); }
      if (amt >= G.cap(r.id) * 0.98) bottlenecks.push(`${r.name}仓储已满`);
    }
    if (G.warmth() < 1) bottlenecks.push('供暖不足');
    if (G.idle() === 0 && S.pop) bottlenecks.push('没有闲置人手');
    const relics = G.list('resources').filter(r => r.group === 'relic' && (S.res[r.id] || 0) > 0).map(r => r.name);
    const chains = Object.entries(D.chains).filter(([, c]) => c.status === 'active').map(([id, c]) => ({ chain_id: id, title: c.title, current_step: c.step, context: c.context, last_player_choice: c.last_choice, due: c.due || null }));
    return {
      reason: reason || 'manual',
      world_meta: { day: env.day, season: CFG.season(env.day), time_of_day: env.phase, stage: S.stage, stage_name: CFG.stageNames[S.stage] || '', chosen_route: S.route,
        environment: { temperature: env.temp, warmth_ratio: Math.round(G.warmth() * 100) / 100 }, unlocked_routes: S.routes },
      settlement_snapshot: {
        population: { total: S.pop, idle: G.idle(), away: G.away(), starving: G.hasBuff('hunger'), jobs: Object.fromEntries(Object.entries(S.jobs).filter(([, n]) => n > 0)) },
        resources_status: { food_days_remaining: days.food === undefined ? null : days.food, fuel_days_remaining: days[CFG.fuel] === undefined ? null : days[CFG.fuel], key_stockpiles: stock, bottlenecks },
        landmarks_built: G.list('buildings').filter(b => S.bld[b.id]).map(b => b.name + (S.bld[b.id] > 1 ? '×' + S.bld[b.id] : '')),
        recent_researches: Object.keys(S.research.done).slice(-5).map(id => (G.def('research', id) || {}).name || id),
        relics_owned: relics,
        active_buffs: S.buffs.map(b => ({ id: b.id, name: (G.def('buffs', b.id) || {}).name, remaining_sec: b.t === null ? null : Math.round(b.t) })),
      },
      exploration_state: {
        active_teams: S.exps.map(e => ({ node: (G.def('nodes', e.node) || {}).name, phase: e.phase, members: e.members, node_progress: Math.round(G.nodeState(e.node).p) / 100 })),
        recent_discovery: D.lastDiscovery,
      },
      storyline_memory: { macro_summary: D.memory.macro, truth_fragments: D.memory.truth, active_event_chains: chains, recent_event_history: D.history.slice(-5) },
      hidden_axes: { alignment_tech: S.align.tech, alignment_magic: S.align.magic, alignment_religion: S.align.faith,
        settlement_cohesion: S.axes.cohesion, pragmatism_vs_empathy: S.axes.empathy, ash_assimilation_depth: S.axes.assimilation, narrative_tension: S.axes.tension },
      memory_compaction_due: (env.day - D.lastCompress) >= CFG.compressDays,
      pool: { queued: D.pool.length, target: CFG.poolTarget },
      tendency_profile: tendency(),
    };
  }
  // 倾向画像 + 建议题材：引擎按玩家倾向占比加权抽签，使事件题材偏向玩家擅长的路线（并偶尔制造反噬）
  const THEME_GUIDE = {
    tech: '机械故障与改良、冶炼与矿脉、旧世工程图纸、工匠灵感、风车与锻炉',
    magic: '炼金实验意外、附魔共鸣、白灰触媒异象、奇异植物变异、学徒冥想',
    faith: '流民朝圣、守夜歌谣、白灰的温顺化、苦修与互助、信徒的神迹体验',
    humanity: '人心与生存抉择：分粮、争执、流民去留、疾病与伤亡，不偏向任何路线',
    challenge: '针对玩家主导路线的反噬或两难：让「偏执」付出代价（如迷信工程者遇到无法测量的异象）',
  };
  function tendency() {
    const S = G.S, a = S.align, sum = a.tech + a.magic + a.faith;
    const share = k => Math.round((a[k] + 1) / (sum + 3) * 100) / 100;
    const sh = { tech: share('tech'), magic: share('magic'), faith: share('faith') };
    const dom = Object.keys(sh).sort((x, y) => sh[y] - sh[x])[0];
    const w = { tech: 0.12 + 0.7 * sh.tech, magic: 0.12 + 0.7 * sh.magic, faith: 0.12 + 0.7 * sh.faith, humanity: 0.1 };
    if (sh[dom] >= 0.55 && sum >= 12) w.challenge = 0.12;
    let r = Math.random() * Object.values(w).reduce((x, y) => x + y, 0), theme = 'humanity';
    for (const k in w) { r -= w[k]; if (r <= 0) { theme = k; break; } }
    return { shares: sh, dominant: sum >= 6 ? dom : null, total_points: sum, suggested_theme: theme, theme_guide: THEME_GUIDE[theme],
      recent_choice_axes: G.S.director.history.slice(-5).map(h => h.axis).filter(Boolean),
      note: 'suggested_theme 由引擎按倾向占比抽签；chain_due 等续写以承接剧情为先，可忽略' };
  }
  // 供 AI 引用的合法标识与数值上限
  function getCatalog() {
    return {
      resources: G.list('resources').filter(r => r.group !== 'relic').map(r => ({ id: r.id, name: r.name, cap: G.cap(r.id) })).concat([{ id: 'population_total', name: '人口（仅可 -N..+N）' }]),
      resource_aliases: CFG.alias, jobs: G.list('jobs').map(j => ({ id: j.id, name: j.name })), buildings: G.list('buildings').map(b => ({ id: b.id, name: b.name })),
      existing_buffs: G.list('buffs').filter(b => !b.managed).map(b => ({ id: b.id, name: b.name, good: b.good !== false })),
      buff_keys: ['res:<资源> (pct 或 flat)', 'job:<岗位>|* (仅 pct)', 'bld:<建筑> (仅 pct)', 'research (pct 或 flat)', 'travel (仅 pct)', 'build (仅 pct)', 'pop:eat (仅 pct)', 'pop:immigrate (仅 pct)', 'pop:housing (仅 flat)', 'pop:heat (仅 flat)', 'cap:<资源> (仅 flat)'],
      projects: G.list('projects').map(p => ({ id: p.id, route: p.route, name: p.name })), nodes: G.list('nodes').map(n => ({ id: n.id, name: n.name, ring: n.ring })),
      limits: Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, { resource_delta_ratio_of_cap: v.res, population_delta: v.pop, axis_delta: v.axis, buff_pct_max: v.pct, buff_duration_max_sec: v.dur, permanent_buff_allowed: v.perm }])),
    };
  }

  /* ---------- 事件注入：校验 → 钳制 → 翻译为引擎事件 ---------- */
  function makeBuff(spec, lv, warn) {
    if (typeof spec === 'string') { if (G.def('buffs', spec)) return { id: spec }; warn.push('未知 buff: ' + spec); return null; }
    if (!spec || !spec.name || !Array.isArray(spec.effects)) { warn.push('buff 缺少 name/effects'); return null; }
    const effects = [];
    for (const e of spec.effects.slice(0, 4)) {
      const key = String(e.key || ''), [p, id] = key.split(':');
      const okKey = ['research', 'travel', 'build', 'pop:eat', 'pop:immigrate', 'pop:housing', 'pop:heat'].includes(key) ||
        (p === 'res' && (id === '*' || G.def('resources', id))) || (p === 'cap' && G.def('resources', id)) ||
        (p === 'job' && (id === '*' || G.def('jobs', id))) || (p === 'bld' && (id === '*' || G.def('buildings', id)));
      if (!okKey) { warn.push('忽略非法 buff key: ' + key); continue; }
      const flatOnly = ['pop:housing', 'pop:heat'].includes(key) || p === 'cap';
      if (e.pct !== undefined && !flatOnly) effects.push({ key, pct: clamp(+e.pct || 0, -lv.pct, lv.pct) });
      else if (e.flat !== undefined && (flatOnly || p === 'res' || key === 'research')) {
        const m = p === 'cap' ? 50 : key === 'pop:housing' ? 3 : key === 'pop:heat' ? 5 : 0.5;
        effects.push({ key, flat: clamp(+e.flat || 0, -m, m) });
      } else warn.push('buff 效果形式不匹配: ' + key);
    }
    if (!effects.length) return null;
    const id = 'ai_' + hash(spec.name + JSON.stringify(effects));
    const perm = spec.permanent === true && lv.perm;
    const d = { id, name: esc(spec.name).slice(0, 16), desc: esc(spec.description || spec.desc || '').slice(0, 120), good: spec.good !== false, effects, ai: true };
    if (!perm) d.duration = clamp(+spec.duration || 180, 20, lv.dur);
    G.S.dyn.buffs[id] = d;
    return { id, duration: d.duration };
  }
  function makeRelic(name, desc) {
    const id = 'relic_ai_' + hash(name);
    if (!G.S.dyn.resources[id]) G.S.dyn.resources[id] = { id, name: esc(name).slice(0, 24), desc: esc(desc || '').slice(0, 160), group: 'relic', cap: 99, ai: true };
    return id;
  }

  function injectEvent(p) {
    const S = G.S, D = S.director, warn = [];
    try {
      if (!p || typeof p !== 'object') return { ok: false, errors: ['payload 不是对象'] };
      const type = ['single', 'chain_step', 'exploration', 'milestone'].includes(p.event_type) ? p.event_type : 'single';
      if (!p.title || !p.narrative_text) return { ok: false, errors: ['缺少 title 或 narrative_text'] };
      if (!Array.isArray(p.options) || !p.options.length) return { ok: false, errors: ['options 至少 1 项'] };
      const lv = limitsFor(type);
      let id = String(p.event_id || 'evt_' + hash(p.title + S.t)).replace(/[^\w-]/g, '_').slice(0, 60);
      if (G.defs.events && G.defs.events[id]) id = 'ai_' + id;
      if (S.ev.active && S.ev.active.id === id) return { ok: false, errors: ['同 id 事件正在进行'] };
      const assess = {};   // 倾向评估：按 option_index（0 起）或 option_id 对应
      for (const a of Array.isArray(p.assessment) ? p.assessment : []) { if (a && a.option_index !== undefined) assess[a.option_index] = a; if (a && a.option_id) assess[a.option_id] = a; }
      const choices = p.options.slice(0, 4).map((o, i) => {
        const cost = {}, res = {}, has = {}, effects = { res, axes: {}, align: {} };
        let pop = 0;
        for (const k in o.resource_deltas || {}) {
          const r = resId(k), raw = +o.resource_deltas[k];
          if (!r || !isFinite(raw)) { warn.push(`选项${i + 1}: 未知资源 ${k}`); continue; }
          if (r === '$pop') { pop = clamp(Math.round(raw), -lv.pop, lv.pop); continue; }
          const lim = Math.max(10, Math.round(lv.res * G.cap(r))), v = clamp(Math.round(raw), -lim, lim);
          if (v < 0) cost[r] = -v; else if (v > 0) res[r] = v;
          if (v !== Math.round(raw)) warn.push(`选项${i + 1}: ${k} 变动被钳制为 ${v}`);
        }
        for (const k in (o.requirements || {}).resources || {}) { const r = resId(k); if (r && r !== '$pop') has[r] = Math.max(0, +o.requirements.resources[k] || 0); }
        const jobs = {};
        for (const k in (o.requirements || {}).min_job || {}) if (G.def('jobs', k)) jobs[k] = Math.min(20, +o.requirements.min_job[k] || 0);
        const req = {}; if (Object.keys(has).length) req.has = has; if (Object.keys(jobs).length) req.jobs = jobs;
        if (+(o.requirements || {}).min_pop) req.pop = Math.min(100, +o.requirements.min_pop);
        const ax = Object.assign({}, o.hidden_axis_deltas, (assess[i] || assess[o.option_id] || {}).axis_deltas);   // 两段式：assessment 优先，兼容旧的逐选项字段
        if (!Object.keys(ax).length) warn.push(`选项${i + 1}: 缺少倾向评估`);
        for (const k in ax) {
          const m = AXIS[k]; if (!m) { warn.push('未知隐式轴 ' + k); continue; }
          const v = clamp(Math.round(+ax[k] || 0), -lv.axis, lv.axis);
          if (m[0] === 'align') effects.align[m[1]] = v; else effects.axes[m[1]] = v;
        }
        if (pop) effects.pop = pop;
        const buffs = (o.buffs || []).slice(0, 2).map(b => makeBuff(b, lv, warn)).filter(Boolean);
        if (buffs.length) effects.buff = buffs;
        const fu = o.follow_up_directive || {};
        const relicName = o.grant_relic ? o.grant_relic.name : fu.grant_relic_name;
        if (relicName) { const rid = makeRelic(relicName, o.grant_relic && o.grant_relic.description); res[rid] = 1; }
        if (p.chain_id || fu.chain_action) effects.ai = { chain_id: p.chain_id || id, title: p.title, action: fu.chain_action || 'advance', trigger: fu.next_step_trigger || '', note: fu.story_note || '', label: o.label };
        const label = String(o.label || '继续').replace(/^「|」$/g, '').slice(0, 80);
        return { text: esc(label), tip: o.hint_text ? `<p>${esc(o.hint_text)}</p>` : undefined, showLocked: true,
          requires: Object.keys(req).length ? req : undefined, cost: Object.keys(cost).length ? cost : undefined, effects,
          result: esc(o.result_text || fu.story_note || '') };
      });
      const evDef = { id, type: 'manual', ai: true, aiType: type, title: esc(p.title), text: esc(p.narrative_text), choices };
      S.dyn.events[id] = evDef;
      // 待触发池：同类型过多时丢弃最旧的一条普通事件
      D.pool.push({ id, urgent: type === 'exploration' || type === 'milestone', at: S.t });
      while (D.pool.length > CFG.poolMax + 1) { const k = D.pool.findIndex(x => !x.urgent); D.pool.splice(k < 0 ? 0 : k, 1); }
      D.lastInject = S.t; st.lastTitle = p.title; st.fails = 0;
      pruneDyn();
      note('注入事件：' + p.title + (warn.length ? '（警告：' + warn.slice(0, 3).join('；') + '）' : ''));
      if (p.deliver === 'now') deliver(true);
      return { ok: true, event_id: id, queued: D.pool.length, warnings: warn };
    } catch (e) { console.error(e); return { ok: false, errors: [String(e.message || e)] }; }
  }
  function pruneDyn() {
    const S = G.S, keep = new Set(S.director.pool.map(x => x.id).concat(S.ev.queue, S.ev.active ? [S.ev.active.id] : [], S.ev.sched.map(x => x.id)));
    const ids = Object.keys(S.dyn.events).filter(id => !keep.has(id));
    ids.slice(0, Math.max(0, ids.length - 20)).forEach(id => delete S.dyn.events[id]);
  }

  /* ---------- 其他工具：记忆 / 隐式轴 / 奠基工程叙事 ---------- */
  function updateMemory(i) {
    const m = G.S.director.memory;
    if (typeof i.macro_summary === 'string') m.macro = i.macro_summary.slice(0, 700);
    if (Array.isArray(i.truth_fragments)) m.truth = i.truth_fragments.slice(0, 10).map(x => String(x).slice(0, 80));
    G.S.director.lastCompress = G.env().day;
    return { ok: true };
  }
  function adjustAxes(i) {
    const out = {};
    for (const k in i.deltas || i) { const m = AXIS[k]; if (!m) continue; const v = clamp(Math.round(+(i.deltas || i)[k] || 0), -10, 10); G.S[m[0]][m[1]] = clamp((G.S[m[0]][m[1]] || 0) + v, m[1] === 'empathy' ? -100 : 0, 100); out[k] = v; }
    return { ok: true, applied: out };
  }
  function setProjectFlavor(i) {
    const p = G.def('projects', i.project_id); if (!p) return { ok: false, errors: ['未知工程 ' + i.project_id] };
    const o = G.S.dyn.projects[p.id] = G.S.dyn.projects[p.id] || {};
    if (i.description) o.desc = esc(i.description).slice(0, 400);
    if (i.bonus_buff) { const b = makeBuff(Object.assign({ permanent: true }, i.bonus_buff), limitsFor('milestone'), []); if (b) o.buff = { id: b.id }; }
    return { ok: true };
  }
  function handleToolCall(name, input) {
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { return { ok: false, errors: ['参数不是合法 JSON'] }; } }
    switch (name) {
      case 'inject_event': return injectEvent(input);
      case 'update_memory': return updateMemory(input || {});
      case 'adjust_axes': return adjustAxes(input || {});
      case 'set_project_flavor': return setProjectFlavor(input || {});
      default: return { ok: false, errors: ['未知工具 ' + name] };
    }
  }

  /* ---------- 事件链、历史与触发 ---------- */
  G.on('aiEffect', a => {
    const D = G.S.director, c = D.chains[a.chain_id] = D.chains[a.chain_id] || { title: a.title, step: 0, status: 'active' };
    c.step++; c.context = a.note || c.context; c.last_choice = a.label; c.title = a.title || c.title;
    if (/^complete/.test(a.action)) { c.status = 'done'; c.due = null; return; }
    c.status = 'active'; c.due = null;
    const t = String(a.trigger || '');
    if (/^after_days:(\d+)/.test(t)) c.due = { day: G.env().day + (+RegExp.$1 || 1) };
    else if (/^on_research_complete/.test(t)) c.due = { research: true };
    else c.due = { day: G.env().day + 2 };
  });
  G.on('choice', c => { const D = G.S.director, ef = c.effects || {}; D.history.push({ day: G.env().day, event: String(c.title).replace(/&[a-z]+;/g, ''), choice: String(c.label).replace(/&[a-z]+;/g, ''), axis: Object.assign({}, ef.align, ef.axes) }); if (D.history.length > 30) D.history.shift(); request('after_choice'); });
  G.on('eventClosed', () => { G.S.director.lastEvent = G.S.t; });
  G.on('expSearch', e => { G.S.director.lastDiscovery = `${e.name}：搜刮所得 ${e.got.join('、') || '一无所获'}（探索度 ${Math.round(e.progress)}%）`; });
  G.on('expArrive', () => request('exploration_arrive', { force: true }));
  G.on('routesUnlocked', () => request('foundation_projects', { force: true }));
  G.on('buff', b => { if (b.id === 'hunger' || b.id === 'freezing') request('crisis:' + b.id, { force: true }); });
  G.on('research', () => { for (const [id, c] of Object.entries(G.S.director.chains)) if (c.status === 'active' && c.due && c.due.research) { c.due = null; request('chain_due:' + id, { force: true, chain: id }); } });
  G.on('day', d => {
    const D = G.S.director;
    for (const [id, c] of Object.entries(D.chains)) if (c.status === 'active' && c.due && c.due.day && d.day >= c.due.day) { c.due = null; request('chain_due:' + id, { force: true, chain: id }); }
    if (d.day - D.lastCompress >= CFG.compressDays) request('compress_memory', { force: true });
    else if (d.day % CFG.periodDays === 0) request('periodic');
  });

  /* ---------- 待触发池 → 引擎（含静态池降级判断） ---------- */
  function deliver(force) {
    const S = G.S, D = S.director, E = S.ev; if (!D.pool.length) return;
    if (E.active && !force) return;
    if (!force && !D.pool[0].urgent && S.t - (D.lastEvent || -1e9) < CFG.eventGap) return;
    const it = D.pool.shift(); if (G.def('events', it.id)) G.trigger(it.id);
  }
  G.rule({ id: 'ai_deliver', every: 2, run: () => deliver(false) });
  G.hooks.holdStatic = () => active() && (st.inFlight || G.S.director.pool.length > 0 || G.S.t - G.S.director.lastInject < CFG.fallbackAfter) && st.fails < 3;
  const active = () => settings.enabled && (st.provider || settings.key || settings.endpoint);

  /* ---------- 工具定义（OpenAI function / Anthropic tool 通用） ---------- */
  const optionSchema = {
    type: 'object', required: ['label'],
    properties: {
      option_id: { type: 'string' }, label: { type: 'string', description: '选项文字，可用「」包裹' }, hint_text: { type: 'string', description: '悬停提示：代价与收益的暗示' },
      requirements: { type: 'object', properties: { resources: { type: 'object', additionalProperties: { type: 'number' } }, min_job: { type: 'object', additionalProperties: { type: 'number' } }, min_pop: { type: 'number' } } },
      resource_deltas: { type: 'object', additionalProperties: { type: 'number' }, description: '资源 id → 变化量（负数=消耗，也可含 population_total）。id 取自 catalog.resources' },
      buffs: { type: 'array', description: '授予的 buff：现有 id 字符串，或 {name,description,good,duration,permanent,effects:[{key,pct|flat}]}', items: {} },
      grant_relic: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } },
      result_text: { type: 'string', description: '选择后展示的结果文字' },
      follow_up_directive: { type: 'object', properties: { chain_action: { type: 'string', enum: ['advance', 'complete', 'complete_with_relic'] }, next_step_trigger: { type: 'string', description: 'after_days:N | on_research_complete:any' }, story_note: { type: 'string' }, grant_relic_name: { type: 'string' } } },
    },
  };
  const TOOLS = [
    { name: 'inject_event', description: '向游戏注入一个事件（单次/事件链步骤/探索奇遇/里程碑）。文本与数值效果分离，所有数值会被引擎二次钳制。',
      parameters: { type: 'object', required: ['event_type', 'title', 'narrative_text', 'options', 'assessment'], properties: {
        event_id: { type: 'string' }, event_type: { type: 'string', enum: ['single', 'chain_step', 'exploration', 'milestone'] }, chain_id: { type: 'string' },
        title: { type: 'string' }, narrative_text: { type: 'string', description: '中文叙事，建议 80~220 字' }, options: { type: 'array', minItems: 1, maxItems: 4, items: optionSchema, description: '先写选项：由情境、现状与玩家历史自然产生，不要预先贴倾向标签' },
        assessment: { type: 'array', description: '写完 options 之后再填：逐个选项判断它实际体现的隐式倾向', items: { type: 'object', required: ['option_index', 'rationale', 'axis_deltas'], properties: {
          option_index: { type: 'number', description: '对应 options 的下标，从 0 开始' }, rationale: { type: 'string', description: '先用一句话说明该选项的做法体现了什么倾向' },
          axis_deltas: { type: 'object', additionalProperties: { type: 'number' }, description: 'alignment_tech/magic/religion, settlement_cohesion, pragmatism_vs_empathy(正=温情,负=功利), ash_assimilation_depth, narrative_tension' } } } },
        deliver: { type: 'string', enum: ['next', 'now'] }, director_internal_thought: { type: 'string' } } } },
    { name: 'update_memory', description: '更新滚动记忆（500 字内的大事记）与「真相拼图」碎片。',
      parameters: { type: 'object', properties: { macro_summary: { type: 'string' }, truth_fragments: { type: 'array', items: { type: 'string' } } } } },
    { name: 'adjust_axes', description: '直接微调隐式轴（每项 ±10）。',
      parameters: { type: 'object', required: ['deltas'], properties: { deltas: { type: 'object', additionalProperties: { type: 'number' } } } } },
    { name: 'set_project_flavor', description: '为文明奠基工程改写叙事文本，并可附加一个永久 bonus_buff（把玩家的独特经历写进工程）。',
      parameters: { type: 'object', required: ['project_id'], properties: { project_id: { type: 'string' }, description: { type: 'string' }, bonus_buff: { type: 'object' } } } },
  ];
  const SYSTEM = `你是文字生存经营游戏「余烬微光」的幕后叙事导演（Director）。
世界观：第二次工业革命时代的世界被「白灰之灾」摧毁；白灰会风化一切与它不同质的造物。幸存者在苍白荒原上重建聚落。隐藏法则是「同类相融」——唯有在造物、施法或信仰中接纳并融合白灰，才能免遭侵蚀。第一阶段为中世纪末期农业手工业聚落，随后在科技/魔法/宗教三条路线中分叉；最终真相是旧文明钻探「地脉深井」引发灾变，先辈以生命留下休眠阀。
你不做算术，也不控制每秒的经营，只通过工具编织事件：
1. 每次收到 context 后，调用 inject_event 生成 1 个事件。第一步：先根据 context.tendency_profile.suggested_theme、当前状况（库存、瓶颈、buff、事件链）与玩家近期选择，写出事件与 2~4 个选项。选项应是这个情境里自然会有的做法，不必强行覆盖科技/魔法/宗教三个方向，也不要预先给选项贴倾向标签；每个选项有清晰代价。文本中文、克制、有荒原的孤寂感，80~220 字。
2. 第二步：写完选项后再填 assessment，逐个判断该选项实际体现的隐式倾向（依据选项的做法本身，而不是你的出题意图）；rationale 先写理由再给数值。温情与功利的符号要与行为一致（分粮救人为温情+，抛弃或强征为功利−）。资源 id 必须取自 catalog.resources；不要给出 limits 之外的数值。buff 要克制：每个事件最多 1~2 个选项带 buff，优先复用 catalog.existing_buffs；自拟 buff 的效果形式必须符合 catalog.buff_keys（pop:heat 只能写 flat 等）。
3. 节奏：narrative_tension 过低且聚落富足时制造危机；聚落濒临崩溃（饥饿/严寒/tension 高）时，给「带代价的生机」，不要再雪上加霜。
4. 事件链：用同一 chain_id，在 follow_up_directive 中声明 advance/complete 与触发时机（after_days:N / on_research_complete:any）；收到 chain_due 时续写下一幕并承接 last_player_choice。
5. reason 为 compress_memory 或 memory_compaction_due 为真时，调用 update_memory 把大事记浓缩到 500 字内，并维护 6~8 条「真相拼图」碎片。
6. reason 为 foundation_projects 时，对每个开放的奠基工程调用 set_project_flavor，把玩家经历写进叙事，并可附加小幅永久加成。
7. reason 为 exploration_arrive 时，生成与当前节点相称的奇遇（event_type=exploration），可授予 grant_relic（前文明遗物）。
8. 倾向偏置：suggested_theme 为 tech/magic/faith 时，事件题材贴合该方向（见 theme_guide），让玩家擅长的路线更常遇到相关的机遇与麻烦；humanity 为人心与生存抉择；challenge 则针对玩家主导的路线制造反噬或两难，让偏执付出代价。续写事件链（chain_due）以承接剧情为先。
只通过工具调用输出，不要输出多余文字。`;

  /* ---------- 请求调度 ---------- */
  function request(reason, opt) {
    opt = opt || {};
    if (!active()) { if (opt.force) note('请求被忽略：导演未启用或未配置接口（请勾选「启用导演」并填写 Key/地址）'); return false; }
    if (st.inFlight || st.fails >= 3) return false;
    const D = G.S.director, now = Date.now();
    if (!opt.force && (D.pool.length >= CFG.poolTarget || now - st.lastReqAt < CFG.minGapMs * 2.5 || G.S.t - (D.lastReqT === undefined ? -1e9 : D.lastReqT) < CFG.minGameGap)) return false;
    if (now - st.lastReqAt < CFG.minGapMs) { st.pendingReason = reason; st.pendingOpt = opt; return false; }
    send(reason, opt);
    return true;
  }
  async function send(reason, opt) {
    st.inFlight = true; st.lastReqAt = Date.now(); st.error = ''; G.S.director.lastReqT = G.S.t;
    const ctx = getContext(reason);
    const user = JSON.stringify({ context: ctx, catalog: getCatalog(), chain_focus: opt.chain || null });
    try {
      const calls = await callProvider({ system: SYSTEM, user, tools: TOOLS, reason, context: ctx });
      let n = 0;
      for (const c of calls) { const r = handleToolCall(c.name, c.input); n++; if (!r.ok) note('工具 ' + c.name + ' 被拒绝：' + (r.errors || []).join('；')); }
      if (!n) throw new Error('AI 没有返回任何工具调用');
      st.fails = 0;
    } catch (e) { st.fails++; st.error = String(e.message || e); note('请求失败（' + st.fails + '/3）：' + st.error); }
    st.inFlight = false;
    if (st.pendingReason && st.fails < 3) { const r = st.pendingReason, o = st.pendingOpt; st.pendingReason = null; setTimeout(() => request(r, o), CFG.minGapMs); }
  }
  async function callProvider(req) {
    if (st.provider) return normalize(await st.provider(req));
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CFG.timeoutMs);
    try {
      if (settings.type === 'anthropic') {
        const r = await fetch(settings.endpoint || 'https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': settings.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: settings.model || 'claude-sonnet-5-5', max_tokens: 3000, system: req.system, tool_choice: { type: 'any' },
            tools: req.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })), messages: [{ role: 'user', content: req.user }] }) });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
        const j = await r.json();
        return (j.content || []).filter(b => b.type === 'tool_use').map(b => ({ name: b.name, input: b.input }));
      }
      const r = await fetch(settings.endpoint || 'https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key },
        body: JSON.stringify({ model: settings.model || 'gpt-4o', tool_choice: 'auto', tools: req.tools.map(t => ({ type: 'function', function: t })),
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] }) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const m = ((await r.json()).choices || [{}])[0].message || {};
      const calls = (m.tool_calls || []).map(c => ({ name: c.function.name, input: c.function.arguments }));
      if (!calls.length && m.content) { const mm = String(m.content).match(/\{[\s\S]*\}/); if (mm) calls.push({ name: 'inject_event', input: mm[0] }); }
      return calls;
    } finally { clearTimeout(timer); }
  }
  const normalize = r => (Array.isArray(r) ? r : r ? [r] : []).map(c => ({ name: c.name || 'inject_event', input: c.input !== undefined ? c.input : c.arguments }));

  /* ---------- 公共 API ---------- */
  const API = G.ai = window.GameAI = {
    getContext, getCatalog, tools: TOOLS, systemPrompt: SYSTEM, injectEvent, handleToolCall,
    setProvider(fn) { st.provider = fn; settings.enabled = true; st.fails = 0; note('已设置自定义 provider'); },
    request: (reason, opt) => request(reason || 'manual', Object.assign({ force: true }, opt)),
    deliverNow: () => deliver(true),
    settings, status: () => ({ enabled: settings.enabled, active: !!active(), inFlight: st.inFlight, fails: st.fails, error: st.error, pool: G.S.director.pool.length, lastTitle: st.lastTitle, log: st.log.slice() }),
  };

  /* ---------- postMessage 桥（外部页面 / 扩展驱动） ---------- */
  window.addEventListener('message', ev => {
    const d = ev.data; if (!settings.bridge || !d || typeof d.type !== 'string' || !d.type.startsWith('glowing_embers:')) return;
    const reply = m => ev.source && ev.source.postMessage(Object.assign({ id: d.id }, m), ev.origin === 'null' ? '*' : ev.origin);
    if (d.type === 'glowing_embers:get_context') reply({ type: 'glowing_embers:context', payload: getContext('bridge'), catalog: getCatalog() });
    else if (d.type === 'glowing_embers:tool_call') reply({ type: 'glowing_embers:tool_result', result: handleToolCall(d.name, d.input) });
  });

  /* ---------- 导演面板（自带 DOM，不依赖主界面渲染） ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.menu'); if (!menu) return;
    const a = document.createElement('a'); a.textContent = '导演'; a.dataset.ai = 'open'; menu.insertBefore(a, menu.firstChild);
    const panel = document.createElement('div'); panel.id = 'aipanel'; document.body.appendChild(panel);
    let timer = null;
    const field = (k, label, type) => `<label>${label}<input data-f="${k}" type="${type || 'text'}" value="${esc(settings[k])}"></label>`;
    const statusHtml = () => {
      const s = API.status(), S = G.S;
      return `状态：${s.active ? (s.inFlight ? '请求中…' : '待命') : '未连接'}　待触发池 ${s.pool}　失败 ${s.fails}/3　隐式轴 张力 ${S.axes.tension} 凝聚 ${S.axes.cohesion} 同化 ${S.axes.assimilation} 温情 ${S.axes.empathy}
        ${s.error ? `<br><span class="lack">${esc(s.error)}</span>` : ''}${s.lastTitle ? '<br>最近注入：' + esc(s.lastTitle) : ''}`;
    };
    const render = () => {
      const s = API.status();
      panel.innerHTML = `<div class="aibox"><h2>AI 叙事导演</h2>
        <p class="info">游戏完全在浏览器内运行：密钥只保存在本机 localStorage，请求由浏览器直连你填写的接口。未连接或失败时自动使用静态事件池。</p>
        <label class="chk"><input data-f="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}> 启用导演</label>
        <label>接口类型<select data-f="type"><option value="openai" ${settings.type === 'openai' ? 'selected' : ''}>OpenAI 兼容（chat/completions）</option><option value="anthropic" ${settings.type === 'anthropic' ? 'selected' : ''}>Anthropic Messages</option></select></label>
        ${field('endpoint', '接口地址（留空=官方）')}${field('model', '模型')}${field('key', 'API Key', 'password')}
        <label class="chk"><input data-f="bridge" type="checkbox" ${settings.bridge ? 'checked' : ''}> 开启 postMessage 桥（外部程序驱动）</label>
        <p class="info" id="aistat">${statusHtml()}</p>
        <div class="airow"><span class="btn" data-ai="request"><b>立即请求</b></span><span class="btn" data-ai="reset"><b>清除失败计数</b></span><span class="btn" data-ai="ctx"><b>导出上下文</b></span></div>
        <textarea data-f="paste" placeholder="粘贴 inject_event JSON 进行测试注入，或点「导出上下文」查看 GameContextPayload"></textarea>
        <div class="airow"><span class="btn" data-ai="inject"><b>注入并立即触发</b></span><span class="btn" data-ai="close"><b>关闭</b></span></div>
        <pre class="ailog">${esc(s.log.join('\n'))}</pre></div>`;
    };
    // 输入框不能被周期性重绘打断：打开时渲染一次，仅刷新状态/日志区
    const refresh = () => { const lg = panel.querySelector('.ailog'), p = panel.querySelector('#aistat'); if (lg) lg.textContent = API.status().log.join('\n'); if (p) p.innerHTML = statusHtml(); };
    const open = () => { render(); panel.classList.add('show'); clearInterval(timer); timer = setInterval(refresh, 1000); };
    const close = () => { panel.classList.remove('show'); clearInterval(timer); };
    document.addEventListener('click', ev => {
      const el = ev.target.closest('[data-ai]'); if (!el) return;
      const act = el.dataset.ai, ta = panel.querySelector('[data-f=paste]');
      if (act === 'open') open();
      else if (act === 'close') close();
      else if (act === 'request') { saveSettings(); st.fails = 0; API.request('manual'); setTimeout(render, 300); }
      else if (act === 'reset') { st.fails = 0; st.error = ''; render(); }
      else if (act === 'ctx') ta.value = JSON.stringify(getContext('manual'), null, 2);
      else if (act === 'inject') {
        try { const r = injectEvent(JSON.parse(ta.value)); if (r.ok) { deliver(true); G.render && G.render(); close(); } else alert(r.errors.join('\n')); } catch (e) { alert('JSON 解析失败：' + e.message); }
      }
    });
    panel.addEventListener('change', ev => {
      const k = ev.target.dataset.f; if (!k || k === 'paste') return;
      settings[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value.trim(); saveSettings();
      if (k === 'enabled' && settings.enabled) { st.fails = 0; request('enabled', { force: true }); }
    });
  });
})(window.Game);
