/* 余烬微光 —— 引擎核心：注册表、状态、条件/消耗/效果、存档 */
(function (global) {
  'use strict';
  const G = { defs: {}, cfg: {}, S: null, D: {}, paused: false, rules: [] };
  global.Game = G;

  /* ---------- 内容注册 ---------- */
  // 内容文件只需调用 Game.define('类型', [条目...]) 即可增补内容
  G.define = function (type, list) {
    const m = (G.defs[type] = G.defs[type] || {});
    list.forEach(d => { if (m[d.id]) console.warn('重复定义', type, d.id); m[d.id] = d; });
  };
  G.list = type => Object.values(G.defs[type] || {});
  G.def = (type, id) => (G.defs[type] || {})[id];
  G.config = o => Object.assign(G.cfg, o);
  G.rule = r => G.rules.push(r);

  /* ---------- 工具 ---------- */
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  G.chance = p => Math.random() < p;
  G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  G.val = (v, ...a) => (typeof v === 'function' ? v(G.S, G, ...a) : v);
  G.name = id => { const r = G.def('resources', id); return r ? r.name : id; };

  /* ---------- 状态 ---------- */
  G.newState = function () {
    const S = {
      v: 1, t: 0, stage: 1, route: null, pop: 0,
      res: {}, seen: {}, bld: {}, jobs: {}, flags: {}, mods: {},
      align: { tech: 0, magic: 0, faith: 0 },
      research: { done: {}, progress: {}, current: null },
      cd: {}, nodes: {}, exps: [], proj: {}, routes: [],
      ev: { cd: {}, done: {}, sched: [], queue: [], nextRoll: 30, active: null },
      rt: {}, bEff: {}, log: [], uid: 1,
    };
    const st = G.cfg.start || {};
    Object.assign(S.res, st.res || {});
    Object.assign(S.flags, st.flags || {});
    return S;
  };

  /* ---------- 条件检查 ---------- */
  G.ok = function (q) {
    if (!q) return true;
    const S = G.S;
    if (typeof q === 'function') return !!q(S, G);
    if (q.has) for (const k in q.has) if ((S.res[k] || 0) < q.has[k]) return false;
    if (q.seen) for (const k of q.seen) if (!S.seen[k]) return false;
    if (q.bld) for (const k in q.bld) if ((S.bld[k] || 0) < q.bld[k]) return false;
    if (q.research) for (const k of q.research) if (!S.research.done[k]) return false;
    if (q.flags) for (const k of q.flags) if (!S.flags[k]) return false;
    if (q.notFlags) for (const k of q.notFlags) if (S.flags[k]) return false;
    if (q.explored) for (const k of q.explored) if (!(S.nodes[k] && S.nodes[k].explored)) return false;
    if (q.stage && S.stage < q.stage) return false;
    if (q.route && S.route !== q.route) return false;
    if (q.pop && S.pop < q.pop) return false;
    if (q.align) for (const k in q.align) if (S.align[k] < q.align[k]) return false;
    if (q.any && !q.any.some(x => G.ok(x))) return false;
    if (q.fn && !q.fn(S, G)) return false;
    return true;
  };

  /* ---------- 消耗 ---------- */
  G.canPay = cost => { for (const k in cost || {}) if ((G.S.res[k] || 0) < cost[k] - 1e-9) return false; return true; };
  G.pay = cost => { if (!G.canPay(cost)) return false; for (const k in cost || {}) G.S.res[k] -= cost[k]; return true; };
  G.costStr = cost => Object.keys(cost || {}).map(k => G.name(k) + ' ' + fmt(cost[k])).join('  ');
  function fmt(n) { return n >= 100 ? Math.floor(n) : Math.round(n * 10) / 10; }
  G.fmt = fmt;

  /* ---------- 效果 ---------- */
  // 所有「选择/研究/建筑/工程」的结果都走这一入口
  G.apply = function (e) {
    if (!e) return;
    const S = G.S;
    if (e.res) for (const k in e.res) {
      const v = e.res[k], n = Array.isArray(v) ? G.randInt(v[0], v[1]) : v;
      if (n >= 0) G.add(k, n); else G.take(k, -n);
    }
    if (e.align) for (const k in e.align) S.align[k] = (S.align[k] || 0) + e.align[k];
    if (e.flags) e.flags.forEach(f => S.flags[f] = true);
    if (e.clearFlags) e.clearFlags.forEach(f => delete S.flags[f]);
    if (e.pop) G.addPop(e.pop);
    if (e.bld) for (const k in e.bld) S.bld[k] = (S.bld[k] || 0) + e.bld[k];
    if (e.mods) for (const k in e.mods) S.mods[k] = (S.mods[k] || 0) + e.mods[k];
    if (e.stage) S.stage = Math.max(S.stage, e.stage);
    if (e.log) G.log(G.val(e.log));
    if (e.schedule) S.ev.sched.push({ id: e.schedule.event, at: S.t + e.schedule.delay });
    if (e.unlockRoutes) G.unlockRoutes();
    if (e.fn) e.fn(S, G);
    G.derive();
    if (e.event) G.trigger(e.event);
  };

  /* ---------- 资源 ---------- */
  G.cap = function (id) {
    const d = G.def('resources', id);
    if (d && d.cap) return d.cap;
    return (G.cfg.baseCap || 100) + ((G.D.storage || {})[id] || 0);
  };
  G.add = function (id, n) {
    const S = G.S, c = G.cap(id), before = S.res[id] || 0;
    const after = Math.min(c, before + n);
    S.res[id] = after;
    if (after > 0) S.seen[id] = true;
    return after - before;
  };
  G.take = (id, n) => { G.S.res[id] = Math.max(0, (G.S.res[id] || 0) - n); };

  /* ---------- 日志 ---------- */
  G.log = function (text, cls) {
    const L = G.S.log;
    L.unshift({ t: G.S.t, text, cls: cls || '' });
    if (L.length > 60) L.length = 60;
    G.dirty = true;
  };

  /* ---------- 存档 ---------- */
  const KEY = 'glowing_embers_save_v1';
  G.save = function () { try { localStorage.setItem(KEY, JSON.stringify(G.S)); return true; } catch (e) { return false; } };
  G.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const base = G.newState(), s = JSON.parse(raw);
      G.S = Object.assign(base, s);
      G.S.ev = Object.assign(base.ev, s.ev);
      G.S.research = Object.assign(base.research, s.research);
      return true;
    } catch (e) { console.warn('读档失败', e); return false; }
  };
  G.reset = function () { localStorage.removeItem(KEY); G.S = G.newState(); G.derive(); G.dirty = true; G.boot(); };
})(window);
