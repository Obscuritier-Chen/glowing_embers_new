/* 余烬微光 —— 引擎系统：衍生数值、生产、人口、研究、事件、探索、奠基工程、主循环 */
(function (G) {
  'use strict';

  /* ---------- 衍生数值（建筑累加） ---------- */
  G.derive = function () {
    const S = G.S, D = { housing: 0, storage: {}, slots: {}, mods: {}, heat: 0 };
    for (const b of G.list('buildings')) {
      const n = S.bld[b.id] || 0; if (!n) continue;
      D.housing += (b.housing || 0) * n;
      for (const k in b.storage || {}) D.storage[k] = (D.storage[k] || 0) + b.storage[k] * n;
      for (const k in b.slots || {}) D.slots[k] = (D.slots[k] || 0) + b.slots[k] * n;
      for (const k in b.mods || {}) D.mods[k] = (D.mods[k] || 0) + b.mods[k] * n;
      D.heat += (b.heat || 0) * n * (S.bEff[b.id] === undefined ? 1 : S.bEff[b.id]);
    }
    // buff：pct 累加进 mods（百分比），flat 累加进 flat（固定数值）
    D.flat = {};
    for (const bf of S.buffs) {
      const d = G.def('buffs', bf.id); if (!d) continue;
      for (const e of d.effects || []) {
        if (e.pct) D.mods[e.key] = (D.mods[e.key] || 0) + e.pct * bf.stacks;
        if (e.flat) D.flat[e.key] = (D.flat[e.key] || 0) + e.flat * bf.stacks;
      }
    }
    D.housing = Math.max(0, D.housing + (D.flat['pop:housing'] || 0));
    D.heat = Math.max(0, D.heat + (D.flat['pop:heat'] || 0));
    G.D = D;
    // 岗位不得超过槽位
    for (const j in S.jobs) if (S.jobs[j] > (D.slots[j] || 0)) S.jobs[j] = D.slots[j] || 0;
  };
  // 百分比加成（含研究/建筑/buff），下限 0；固定数值加成
  G.mod = key => Math.max(0, 1 + (G.S.mods[key] || 0) + ((G.D.mods || {})[key] || 0));
  G.flat = key => (G.D.flat || {})[key] || 0;

  /* ---------- Buff ----------
     定义：{id,name,desc,good,duration(秒，省略=永久),stack:'refresh'|'stack'|'ignore',maxStacks,
            effects:[{key, pct}|{key, flat}], onApply, onExpire}
     key：'res:资源'(产出%/固定每秒) 'job:岗位' 'bld:建筑' 'research' 'travel' 'build'
          'pop:eat' 'pop:immigrate' 'pop:housing' 'pop:heat' 'cap:资源'(固定上限) */
  G.hasBuff = id => G.S.buffs.some(b => b.id === id);
  G.addBuff = function (spec) {
    spec = typeof spec === 'string' ? { id: spec } : spec;
    const d = G.def('buffs', spec.id); if (!d) return console.warn('未知buff', spec.id);
    const dur = spec.duration !== undefined ? spec.duration : d.duration;
    const cur = G.S.buffs.find(b => b.id === d.id);
    if (cur) {
      if (d.stack === 'ignore') return;
      if (d.stack === 'stack') cur.stacks = Math.min(d.maxStacks || 99, cur.stacks + (spec.stacks || 1));
      if (cur.t !== null) cur.t = dur === undefined ? null : Math.max(cur.t, dur);
    } else {
      G.S.buffs.push({ id: d.id, t: dur === undefined ? null : dur, stacks: spec.stacks || 1 });
      if (d.onApply) G.apply(d.onApply);
    }
    G.log('【' + d.name + '】' + (d.good === false ? '缠上了聚落。' : '降临了聚落。'), d.good === false ? 'bad' : 'good');
    G.derive();
  };
  G.removeBuff = function (id) {
    const i = G.S.buffs.findIndex(b => b.id === id); if (i < 0) return;
    G.S.buffs.splice(i, 1); G.derive();
  };
  function tickBuffs(dt) {
    for (const b of G.S.buffs.slice()) {
      if (b.t === null) continue;
      b.t -= dt;
      if (b.t > 0) continue;
      const d = G.def('buffs', b.id);
      G.S.buffs.splice(G.S.buffs.indexOf(b), 1);
      if (d) { G.log('【' + d.name + '】消退了。'); if (d.onExpire) G.apply(d.onExpire); }
    }
    // 固定数值的资源增减（每秒）
    for (const k in G.D.flat) if (k.startsWith('res:')) {
      const id = k.slice(4), v = G.D.flat[k] * dt;
      if (v > 0) G.add(id, v); else G.take(id, -v);
    }
  }

  /* ---------- 资源产耗来源明细（供悬浮提示用） ---------- */
  G.rates = function (id) {
    const S = G.S, out = [], m = G.mod('res:' + id);
    for (const b of G.list('buildings')) {
      const n = S.bld[b.id] || 0; if (!n) continue;
      const e = S.bEff[b.id] === undefined ? 1 : S.bEff[b.id];
      if (b.produce && b.produce[id]) out.push({ src: b.name + ' ×' + n, rate: b.produce[id] * n * e * G.mod('bld:' + b.id) * m });
      if (b.consume && b.consume[id]) out.push({ src: b.name + ' ×' + n, rate: -b.consume[id] * n * e });
    }
    for (const j of G.list('jobs')) {
      const w = S.jobs[j.id] || 0; if (!w) continue;
      const e = S.jEff[j.id] === undefined ? 1 : S.jEff[j.id];
      if (j.produce && j.produce[id]) out.push({ src: j.name + ' ×' + w, rate: j.produce[id] * w * e * G.mod('job:' + j.id) * m });
      if (j.consume && j.consume[id]) out.push({ src: j.name + ' ×' + w, rate: -j.consume[id] * w * e });
    }
    for (const bf of S.buffs) {
      const d = G.def('buffs', bf.id);
      for (const e of d.effects || []) if (e.key === 'res:' + id && e.flat) out.push({ src: d.name, rate: e.flat * bf.stacks });
    }
    for (const r of G.rules) if (r.rates && r.rates[id]) {
      const v = r.rates[id](S, G); if (v) out.push({ src: r.label || r.id, rate: v });
    }
    return out;
  };

  /* ---------- 建筑 ---------- */
  G.bCost = function (b) {
    const n = G.S.bld[b.id] || 0, m = b.costMult || G.cfg.costMult || 1.15, c = {};
    for (const k in b.cost) c[k] = Math.ceil(b.cost[k] * Math.pow(m, n));
    return c;
  };
  G.canBuild = b => (!b.max || (G.S.bld[b.id] || 0) < b.max) && G.canPay(G.bCost(b));
  G.build = function (id) {
    const b = G.def('buildings', id);
    if (!b || !G.canBuild(b)) return;
    G.pay(G.bCost(b));
    G.S.bld[id] = (G.S.bld[id] || 0) + 1;
    if (b.onBuild) G.apply(b.onBuild);
    if (b.buildLog) G.log(b.buildLog);
    G.derive();
  };
  G.buildingVisible = function (b) {
    if (!G.ok(b.requires)) return false;
    if ((G.S.bld[b.id] || 0) > 0) return true;
    return Object.keys(b.cost).every(k => G.S.seen[k]);
  };

  /* ---------- 人口与岗位 ---------- */
  G.away = () => G.S.exps.reduce((a, e) => a + e.members, 0);
  G.assigned = () => Object.values(G.S.jobs).reduce((a, b) => a + b, 0);
  G.idle = () => G.S.pop - G.assigned() - G.away();
  G.addPop = function (n) {
    const S = G.S;
    if (n >= 0) { S.pop += n; return; }
    for (let i = 0; i < -n && S.pop > 0; i++) {
      S.pop--;
      if (G.idle() < 0) { // 先扣岗位上的人
        const js = Object.keys(S.jobs).filter(j => S.jobs[j] > 0);
        if (js.length) S.jobs[G.pick(js)]--; else if (S.exps.length) S.exps[0].members = Math.max(0, S.exps[0].members - 1);
      }
    }
  };
  G.setJob = function (id, d) {
    const S = G.S, cur = S.jobs[id] || 0;
    if (d > 0 && (G.idle() < 1 || cur >= (G.D.slots[id] || 0))) return;
    if (d < 0 && cur < 1) return;
    S.jobs[id] = cur + (d > 0 ? 1 : -1);
  };

  /* ---------- 生产/消耗通用函数 ---------- */
  function produce(def, count, dt, modKey, out) {
    if (!count) return 0;
    const cons = def.consume || {};
    let eff = 1;
    for (const k in cons) { const need = cons[k] * count * dt; if (need > 0) eff = Math.min(eff, (G.S.res[k] || 0) / need); }
    eff = Math.max(0, Math.min(1, eff));
    if (eff <= 0) return 0;
    for (const k in cons) G.take(k, cons[k] * count * dt * eff);
    const m = G.mod(modKey);
    for (const k in def.produce || {}) G.add(k, def.produce[k] * count * dt * eff * m * G.mod('res:' + k));
    return eff;
  }

  /* ---------- 环境 ---------- */
  G.env = function () {
    const S = G.S, c = G.cfg, dayLen = c.dayLength || 120, f = (S.t % dayLen) / dayLen;
    const phases = c.phases || ['清晨', '白昼', '黄昏', '深夜'];
    return {
      day: Math.floor(S.t / dayLen) + 1,
      phase: phases[Math.floor(f * phases.length)],
      night: f > 0.75,
      temp: Math.round(G.val(c.temp, S.t) * 10) / 10 || 0,
    };
  };
  // 供暖比：>=1 表示暖和
  G.warmth = () => { const need = Math.max(1, G.S.pop * (G.cfg.heatPerPop || 1)); return G.D.heat / need; };

  /* ---------- 研究 ---------- */
  G.researchAvailable = r => !G.S.research.done[r.id] && G.ok(r.requires);
  G.researchRate = () => {
    let w = 0;
    for (const j of G.list('jobs')) w += (G.S.jobs[j.id] || 0) * (j.research || 0);
    return Math.max(0, w * G.mod('research') + G.flat('research'));
  };
  G.startResearch = function (id) {
    const R = G.S.research, r = G.def('research', id);
    if (!r || !G.researchAvailable(r)) return;
    if (R.progress[id] === undefined) { if (!G.pay(r.cost)) return; R.progress[id] = 0; }
    R.current = id;
  };
  function tickResearch(dt) {
    const R = G.S.research; if (!R.current) return;
    const r = G.def('research', R.current);
    R.progress[r.id] += G.researchRate() * dt;
    if (R.progress[r.id] >= r.time) {
      R.done[r.id] = true; R.current = null; delete R.progress[r.id];
      G.log('研究完成：' + r.name, 'good');
      G.apply(r.effects);
    }
  }

  /* ---------- 事件 ---------- */
  G.trigger = function (id) {
    const ev = G.def('events', id), E = G.S.ev;
    if (!ev) return console.warn('未知事件', id);
    if (E.active) { E.queue.push(id); return; }
    E.active = { id, result: null, next: null };
    E.cd[id] = G.S.t; if (ev.once !== false && ev.once) E.done[id] = true;
    if (ev.onShow) G.apply(ev.onShow);
    G.paused = true;
  };
  G.choiceOk = c => G.ok(c.requires) && G.canPay(c.cost);
  G.choose = function (i) {
    const E = G.S.ev, a = E.active; if (!a || a.result !== null) return;
    const ev = G.def('events', a.id), c = ev.choices[i];
    if (!c || !G.choiceOk(c)) return;
    G.pay(c.cost);
    G.apply(c.effects);
    a.result = G.val(c.result) || '';
    a.next = c.next || null;
    if (c.schedule) E.sched.push({ id: c.schedule.event, at: G.S.t + c.schedule.delay });
  };
  G.closeEvent = function () {
    const E = G.S.ev, a = E.active; if (!a) return;
    E.active = null;
    const nxt = a.next || E.queue.shift();
    G.paused = false;
    if (nxt) G.trigger(nxt);
  };
  function tickEvents(dt) {
    const S = G.S, E = S.ev; if (E.active) return;
    // 预约事件（多幕事件链）
    for (let i = 0; i < E.sched.length; i++) if (E.sched[i].at <= S.t) { const s = E.sched.splice(i, 1)[0]; G.trigger(s.id); return; }
    const evs = G.list('events');
    // 进程推进事件：条件满足必触发
    for (const ev of evs) if (ev.type === 'milestone' && !E.done[ev.id] && G.ok(ev.requires)) { E.done[ev.id] = true; G.trigger(ev.id); return; }
    // 随机事件
    if (S.t < E.nextRoll) return;
    E.nextRoll = S.t + (G.cfg.eventInterval || 25);
    if (!G.chance(G.cfg.eventChance === undefined ? 0.6 : G.cfg.eventChance)) return;
    const pool = evs.filter(ev => (!ev.type || ev.type === 'single') && !E.done[ev.id] &&
      (S.t - (E.cd[ev.id] || -1e9)) > (ev.cooldown || G.cfg.eventCooldown || 180) && G.ok(ev.requires));
    if (!pool.length) return;
    let tot = pool.reduce((a, e) => a + (e.weight || 1), 0), r = Math.random() * tot;
    for (const ev of pool) { r -= (ev.weight || 1); if (r <= 0) { G.trigger(ev.id); return; } }
  }

  /* ---------- 探索 ---------- */
  G.nodeState = id => (G.S.nodes[id] = G.S.nodes[id] || { p: 0, explored: false });
  G.nodeVisible = n => G.ok(n.requires);
  G.travelTime = n => n.travel / G.mod('travel');
  G.startExpedition = function (nodeId, members) {
    const S = G.S, n = G.def('nodes', nodeId);
    if (!n || members < 1 || members > G.idle()) return false;
    const supply = Math.ceil((n.supply || 2) * members);
    if (!G.canPay({ food: supply })) return false;
    G.pay({ food: supply });
    S.exps.push({ id: S.uid++, node: nodeId, members, supply, bag: {}, phase: 'go', t: 0, dur: G.travelTime(n) });
    G.log('探索队离开了火光，向' + n.name + '出发。');
    return true;
  };
  G.expAction = function (id, act) {
    const e = G.S.exps.find(x => x.id === id); if (!e || e.phase !== 'at') return;
    const n = G.def('nodes', e.node);
    if (act === 'search') {
      const need = (n.searchCost || 1) * e.members;
      if (e.supply < need || G.nodeState(e.node).p >= 100) return;
      e.supply -= need; e.phase = 'search'; e.t = 0; e.dur = n.searchTime || 4;
    } else if (act === 'back') { e.phase = 'back'; e.t = 0; e.dur = G.travelTime(n); }
  };
  function doSearch(e, n) {
    const ns = G.nodeState(e.node);
    ns.p = Math.min(100, ns.p + (n.step || 20));
    const got = [];
    for (const l of n.loot || []) if (G.chance(l.chance === undefined ? 1 : l.chance)) {
      const q = G.randInt(l.min || 1, l.max || l.min || 1);
      e.bag[l.res] = (e.bag[l.res] || 0) + q; got.push(G.name(l.res) + '×' + q);
    }
    G.log(n.name + '：搜刮所得 ' + (got.length ? got.join('、') : '一无所获') + '（探索度 ' + Math.round(ns.p) + '%）');
    if (n.danger && G.chance(n.danger) && e.members > 0) {
      e.members--; G.S.pop--;
      G.log('队伍中有人再也没有从废墟的阴影里走出来。', 'bad');
    }
    for (const x of n.events || []) if (G.chance(x.chance) && !(x.once && G.S.ev.done[x.event])) G.trigger(x.event);
    if (ns.p >= 100 && !ns.explored) {
      ns.explored = true; G.log(n.name + '已被彻底探明。', 'good'); G.apply(n.onExplored);
    }
  }
  function tickExps(dt) {
    const S = G.S;
    for (const e of S.exps.slice()) {
      const n = G.def('nodes', e.node);
      if (e.phase === 'at') continue;
      e.t += dt; if (e.t < e.dur) continue;
      if (e.phase === 'go') { e.phase = 'at'; G.log('探索队抵达了' + n.name + '。'); }
      else if (e.phase === 'search') { e.phase = 'at'; doSearch(e, n); }
      else if (e.phase === 'back') {
        for (const k in e.bag) G.add(k, e.bag[k]);
        G.add('food', e.supply);
        S.exps.splice(S.exps.indexOf(e), 1);
        G.log('探索队带着收获回到了篝火旁。', 'good');
        if (e.members <= 0) G.log('……但没有一个人回来。', 'bad');
      }
      if (e.members <= 0 && S.exps.includes(e)) S.exps.splice(S.exps.indexOf(e), 1);
    }
  }

  /* ---------- 文明奠基工程 ---------- */
  G.unlockRoutes = function () {
    const S = G.S, th = G.cfg.alignThreshold || 10, r = [];
    for (const k of ['tech', 'magic', 'faith']) if (S.align[k] >= th) r.push(k);
    if (!r.length) r.push(['tech', 'magic', 'faith'].sort((a, b) => S.align[b] - S.align[a])[0]);
    S.routes = r;
    G.log('可立项的文明奠基工程已确定。', 'good');
  };
  G.projState = id => (G.S.proj[id] = G.S.proj[id] || { stage: 0, building: false, t: 0 });
  G.projAvailable = p => G.S.routes.includes(p.route) && !G.S.route;
  G.startProjStage = function (id) {
    const p = G.def('projects', id), st = G.projState(id), sd = p.stages[st.stage];
    if (!G.projAvailable(p) || st.building || !sd || !G.pay(sd.cost)) return;
    st.building = true; st.t = 0;
  };
  function tickProj(dt) {
    for (const p of G.list('projects')) {
      const st = G.S.proj[p.id]; if (!st || !st.building) continue;
      const sd = p.stages[st.stage];
      st.t += dt * G.mod('build');
      if (st.t < sd.time) continue;
      st.building = false; st.stage++;
      G.log(p.name + '：' + sd.name + '完工。', 'good');
      if (st.stage >= p.stages.length && !G.S.route) {
        G.S.route = p.route; G.S.stage = 2;
        G.apply(p.onComplete);
      }
    }
  }

  /* ---------- 行动（手动点击） ---------- */
  G.actionOk = a => G.ok(a.requires) && !(G.S.cd[a.id] > 0) && G.canPay(a.cost);
  G.doAction = function (id) {
    const a = G.def('actions', id);
    if (!a || !G.actionOk(a)) return;
    G.pay(a.cost);
    G.S.cd[id] = a.cooldown || 0;
    G.apply(a.effects);
    if (a.logs) G.log(G.pick(a.logs));
  };

  /* ---------- 主循环 ---------- */
  G.tick = function (dt) {
    const S = G.S;
    S.t += dt;
    G.derive();
    // 建筑被动产出
    for (const b of G.list('buildings')) {
      const n = S.bld[b.id] || 0;
      if (b.produce || b.consume || b.heat) S.bEff[b.id] = n ? produce(b, n, dt, 'bld:' + b.id) : 1;
    }
    // 岗位产出
    for (const j of G.list('jobs')) { const n = S.jobs[j.id] || 0; S.jEff[j.id] = n ? produce(j, n, dt, 'job:' + j.id) : 1; }
    tickBuffs(dt);
    tickResearch(dt);
    tickExps(dt);
    tickProj(dt);
    for (const k in S.cd) if (S.cd[k] > 0) S.cd[k] = Math.max(0, S.cd[k] - dt);
    for (const r of G.rules) {
      if (!r.every) { r.run(S, G, dt); continue; }
      S.rt[r.id] = (S.rt[r.id] || 0) + dt;
      if (S.rt[r.id] >= r.every) { S.rt[r.id] = 0; r.run(S, G, r.every); }
    }
    tickEvents(dt);
    G.derive();
    for (const k in S.res) if (S.res[k] > 0) S.seen[k] = true;
  };

  G.advance = function (dt) {
    dt = Math.min(dt, 300);
    while (dt > 0 && !G.paused) { const s = Math.min(dt, 0.25); G.tick(s); dt -= s; }
  };

  G.boot = function () { G.derive(); G.paused = !!G.S.ev.active; G.dirty = true; };
  G.init = function () {
    const speed = parseFloat(new URLSearchParams(location.search).get('speed')) || 1;
    if (!G.load()) G.S = G.newState();
    G.boot();
    let last = performance.now(), saveT = 0;
    setInterval(() => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      if (!G.paused) G.advance(dt * speed);
      saveT += dt; if (saveT > 15) { saveT = 0; G.save(); }
      G.render && G.render();
    }, 100);
    window.addEventListener('beforeunload', G.save);
  };
})(window.Game);
