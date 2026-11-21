/* 余烬微光 —— 界面：状态 → HTML 字符串 → 轻量 DOM 对比更新（保证按钮点击不被重绘打断）
   注释一律不直接显示：静态注释写入 data-tip，动态注释（资源产耗、buff 等）用 data-tipt/data-tipa 在悬停时现算。 */
(function (G) {
  'use strict';
  const ui = (G.ui = { tab: 'settle', party: {}, hover: null });
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = n => (Math.round(n * 10) / 10);

  /* ---------- DOM 对比 ---------- */
  function sync(a, b) {
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  }
  function morph(a, b) {
    const an = [...a.childNodes], bn = [...b.childNodes];
    bn.forEach((y, i) => {
      const x = an[i];
      if (!x) return a.appendChild(y.cloneNode(true));
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) return a.replaceChild(y.cloneNode(true), x);
      if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
      sync(x, y); morph(x, y);
    });
    while (a.childNodes.length > bn.length) a.removeChild(a.lastChild);
  }
  const cache = {};
  function put(id, html) {
    if (cache[id] === html) return; cache[id] = html;
    const el = $(id), t = document.createElement('div'); t.innerHTML = html; morph(el, t);
  }

  /* ---------- 文案工具 ---------- */
  const sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);
  const pct = n => sgn(Math.round(n * 1000) / 10) + '%';
  const rate = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2) + '/秒';
  const tm = s => s === null ? '永久' : Math.floor(s / 60) + ':' + String(Math.ceil(s % 60) % 60).padStart(2, '0');
  const tipAttr = html => html ? ` data-tip="${esc(html)}"` : '';
  const dyn = (t, a) => ` data-tipt="${t}" data-tipa="${esc(a)}"`;

  // 加成键 → 中文
  function keyLabel(key, flat) {
    const [p, id] = key.split(':');
    const all = id === '*';
    const nm = { res: () => all ? '全部资源产出' : G.name(id) + (flat ? '' : '产出'), job: () => all ? '全体岗位效率' : (G.def('jobs', id) || {}).name + '效率',
      bld: () => all ? '全体建筑效率' : (G.def('buildings', id) || {}).name + '效率', cap: () => G.name(id) + '容量' }[p];
    if (nm) return nm();
    return ({ research: '研究速度', travel: '行军速度', build: '施工速度', 'pop:eat': '人口口粮消耗', 'pop:immigrate': '移民几率',
      'pop:housing': '人口上限', 'pop:heat': '供暖' })[key] || key;
  }
  const effLine = e => e.pct !== undefined ? `${keyLabel(e.key)} ${pct(e.pct)}`
    : `${keyLabel(e.key, true)} ${sgn(e.flat)}${e.key.startsWith('res:') ? '/秒' : ''}`;
  const resList = (o, sign) => Object.keys(o || {}).map(k => `${G.name(k)} ${sign}${o[k]}/秒`).join('，');

  /* ---------- 悬浮提示内容 ---------- */
  const TIPS = {
    res(id) {
      const d = G.def('resources', id) || {}, S = G.S, rows = G.rates(id);
      let h = `<b>${d.name}</b>` + (d.desc ? `<p>${d.desc}</p>` : '');
      if (d.group !== 'relic') {
        const net = rows.reduce((a, r) => a + r.rate, 0);
        h += `<p>当前 ${G.fmt(S.res[id] || 0)} / ${G.cap(id)}　净产出 <span class="${net < 0 ? 'bad' : 'good'}">${rate(net)}</span></p>`;
        h += rows.length ? rows.map(r => `<div class="tr"><span>${r.src}</span><span class="${r.rate < 0 ? 'bad' : 'good'}">${rate(r.rate)}</span></div>`).join('') : '<p class="dim">暂无稳定产出或消耗</p>';
        const m = G.mod('res:' + id);
        if (Math.abs(m - 1) > 1e-6) h += `<p class="dim">产出加成 ${pct(m - 1)}</p>`;
      }
      return h;
    },
    buff(id) {
      const d = G.def('buffs', id), b = G.S.buffs.find(x => x.id === id);
      if (!d || !b) return '';
      return `<b class="${d.good === false ? 'bad' : 'good'}">${d.name}${b.stacks > 1 ? ' ×' + b.stacks : ''}</b><p>${d.desc || ''}</p>` +
        (d.effects || []).map(e => `<div class="tr"><span>${effLine(Object.assign({}, e, { pct: e.pct !== undefined ? e.pct * b.stacks : undefined, flat: e.flat !== undefined ? e.flat * b.stacks : undefined }))}</span></div>`).join('') +
        `<p class="dim">${b.t === null ? '永久' : '剩余 ' + tm(b.t)}</p>`;
    },
    pop() {
      const S = G.S; let h = '<b>人口</b>';
      h += `<p>总数 ${S.pop}，在岗 ${G.assigned()}，外出 ${G.away()}，闲置 ${G.idle()}</p><p class="dim">人口上限来源：</p>`;
      for (const b of G.list('buildings')) if (S.bld[b.id] && b.housing) h += `<div class="tr"><span>${b.name} ×${S.bld[b.id]}</span><span>+${b.housing * S.bld[b.id]}</span></div>`;
      if (G.flat('pop:housing')) h += `<div class="tr"><span>其他</span><span>${sgn(G.flat('pop:housing'))}</span></div>`;
      return h;
    },
    warm() {
      return `<b>温度与供暖</b><p>环境 ${G.env().temp}°；供暖 ${f1(G.D.heat)} / 需求 ${f1(Math.max(1, G.S.pop * (G.cfg.heatPerPop || 1)))}</p>
        <p class="dim">供暖不足时人口会生病、冻死；篝火需要持续添柴。</p>`;
    },
  };
  function buildingTip(b) {
    const L = [];
    if (b.desc) L.push(`<p>${b.desc}</p>`);
    if (b.housing) L.push(`人口上限 +${b.housing}`);
    if (b.heat) L.push(`供暖 +${b.heat}`);
    for (const k in b.storage || {}) L.push(`${G.name(k)}容量 +${b.storage[k]}`);
    for (const k in b.slots || {}) L.push(`${(G.def('jobs', k) || {}).name || k}岗位 +${b.slots[k]}`);
    if (b.produce) L.push('产出 ' + resList(b.produce, '+'));
    if (b.consume) L.push('消耗 ' + resList(b.consume, '−'));
    for (const k in b.mods || {}) L.push(`${keyLabel(k)} ${pct(b.mods[k])}`);
    return `<b>${b.name}</b>` + L.map(x => x.startsWith('<') ? x : `<div class="tr"><span>${x}</span></div>`).join('');
  }
  function jobTip(j) {
    const L = [`<b>${j.name}</b>`];
    if (j.desc) L.push(`<p>${j.desc}</p>`);
    if (j.produce) L.push(`<div class="tr"><span>每人 ${resList(j.produce, '+')}</span></div>`);
    if (j.consume) L.push(`<div class="tr"><span>每人 ${resList(j.consume, '−')}</span></div>`);
    if (j.research) L.push(`<div class="tr"><span>每人 研究 +${j.research}/秒</span></div>`);
    const m = G.mod('job:' + j.id);
    if (Math.abs(m - 1) > 1e-6) L.push(`<p class="dim">效率 ${pct(m - 1)}</p>`);
    return L.join('');
  }
  const named = (name, desc) => `<b>${name}</b>` + (desc ? `<p>${desc}</p>` : '');

  /* ---------- 组件 ---------- */
  function btn(label, act, arg, o) {
    o = o || {};
    const dis = o.disabled ? ' disabled' : '';
    const bar = o.bar !== undefined ? `<i class="bar" style="width:${(o.bar * 100).toFixed(2)}%"></i>` : '';
    return `<div class="btn${dis}${o.cls ? ' ' + o.cls : ''}" data-act="${act}" data-arg="${esc(arg === undefined ? '' : arg)}"${tipAttr(o.tip)}>${bar}<b>${label}</b>` +
      (o.sub ? `<small>${o.sub}</small>` : '') + `</div>`;
  }
  const costHtml = cost => Object.keys(cost || {}).map(k =>
    `<span class="${(G.S.res[k] || 0) >= cost[k] ? '' : 'lack'}">${G.name(k)} ${G.fmt(cost[k])}</span>`).join(' ');
  const box = (title, inner, tip) => inner ? `<div class="box"${tipAttr(tip)}><h3>${title}</h3>${inner}</div>` : '';
  const bar = (p, txt) => `<div class="pbar"><i style="width:${Math.min(100, p * 100).toFixed(2)}%"></i><span>${txt || ''}</span></div>`;

  /* ---------- 各页签 ---------- */
  function tabSettle() {
    const S = G.S;
    const acts = G.list('actions').filter(a => G.ok(a.requires) || S.cd[a.id] > 0).map(a =>
      btn(a.name, 'action', a.id, { disabled: !G.actionOk(a), sub: costHtml(a.cost), tip: a.desc && named(a.name, a.desc), bar: a.cooldown && S.cd[a.id] > 0 ? S.cd[a.id] / a.cooldown : undefined })).join('');
    const blds = G.list('buildings').filter(G.buildingVisible).map(b => {
      const n = S.bld[b.id] || 0;
      return btn(`${b.name}${n ? ' ×' + n : ''}`, 'build', b.id, { disabled: !G.canBuild(b), sub: (b.max && n >= b.max ? '已建成' : costHtml(G.bCost(b))), tip: buildingTip(b) });
    }).join('');
    const jobs = G.list('jobs').filter(j => (G.D.slots[j.id] || 0) > 0 || S.jobs[j.id]).map(j => {
      const w = S.jobs[j.id] || 0, sl = G.D.slots[j.id] || 0;
      return `<div class="row"><span class="grow"${tipAttr(jobTip(j))}>${j.name} <em>${w}/${sl}</em></span>
        <div class="mini ${w < 1 ? 'disabled' : ''}" data-act="job-" data-arg="${j.id}">−</div>
        <div class="mini ${G.idle() < 1 || w >= sl ? 'disabled' : ''}" data-act="job+" data-arg="${j.id}">＋</div></div>`;
    }).join('');
    return box('行动', acts) + box('建造', blds) + box('岗位', jobs);
  }

  function tabExplore() {
    const S = G.S, rings = G.cfg.rings || {};
    let h = '';
    for (const e of S.exps) {
      const n = G.def('nodes', e.node), bag = Object.keys(e.bag).map(k => G.name(k) + '×' + e.bag[k]).join('、') || '空';
      let st = '';
      if (e.phase === 'go' || e.phase === 'back') st = bar(e.t / e.dur, e.phase === 'go' ? '前往' + n.name : '返回聚落');
      else if (e.phase === 'search') st = bar(e.t / e.dur, '搜刮中');
      else {
        const ns = G.nodeState(e.node);
        st = bar(ns.p / 100, '探索度 ' + Math.round(ns.p) + '%') + '<div class="row">' +
          btn('搜刮', 'exp-search', e.id, { disabled: ns.p >= 100 || e.supply < (n.searchCost || 1) * e.members, sub: '口粮 ' + f1((n.searchCost || 1) * e.members) }) +
          btn('返回', 'exp-back', e.id) + '</div>';
      }
      h += box(`探索队 · ${n.name}（${e.members}人）`, `${st}<p class="info">口粮余量 ${f1(e.supply)}　背包：${bag}</p>`);
    }
    const idle = G.idle();
    const groups = {};
    for (const n of G.list('nodes')) if (G.nodeVisible(n)) (groups[n.ring || 1] = groups[n.ring || 1] || []).push(n);
    for (const r in groups) {
      h += box(rings[r] || '荒原', groups[r].map(n => {
        const ns = S.nodes[n.id] || { p: 0 }, k = Math.max(1, Math.min(ui.party[n.id] || 1, idle || 1));
        const out = S.exps.some(e => e.node === n.id);
        return `<div class="node"><div class="row"><span class="grow"${tipAttr(named(n.name, n.desc))}><b>${n.name}</b> <em>${Math.round(ns.p)}%</em></span></div>
          <div class="row"><div class="mini" data-act="party-" data-arg="${n.id}">−</div><span class="party">${k} 人</span><div class="mini" data-act="party+" data-arg="${n.id}">＋</div>
          ${btn('出发', 'exp-go', n.id, { disabled: out || idle < 1 || !G.canPay({ food: Math.ceil((n.supply || 2) * k) }), sub: `行程 ${Math.round(G.travelTime(n))}秒　口粮 ${Math.ceil((n.supply || 2) * k)}` })}</div></div>`;
      }).join(''));
    }
    return h;
  }

  function tabResearch() {
    const R = G.S.research;
    let h = '';
    if (R.current) {
      const r = G.def('research', R.current);
      h += box('当前课题', `<b>${r.name}</b>` + bar(R.progress[r.id] / r.time, `${Math.round(R.progress[r.id] / r.time * 100)}%`) +
        `<p class="info">研究速度 ${f1(G.researchRate())}/秒（分配学者以加快）</p>`, named(r.name, r.desc));
    }
    h += box('可研究课题', G.list('research').filter(G.researchAvailable).map(r => {
      const started = R.progress[r.id] !== undefined, cur = R.current === r.id;
      return btn(r.name + (cur ? '（进行中）' : started ? '（已立项）' : ''), 'research', r.id,
        { disabled: cur || (!started && !G.canPay(r.cost)), sub: started ? '继续攻关' : costHtml(r.cost), tip: named(r.name, r.desc) });
    }).join(''));
    const done = Object.keys(R.done).map(id => { const r = G.def('research', id); return `<span class="chip"${tipAttr(named(r.name, r.desc))}>${r.name}</span>`; });
    h += box('已完成', done.join(''));
    return h;
  }

  function tabProject() {
    const S = G.S;
    if (!S.routes.length) return '';
    return G.list('projects').map(p => {
      const st = G.projState(p.id), done = S.route === p.route;
      if (!G.projAvailable(p) && !done) return '';
      const sd = p.stages[st.stage];
      let inner = '';
      p.stages.forEach((s, i) => inner += `<p class="stage ${i < st.stage ? 'done' : ''}"${tipAttr(named(s.name, s.desc))}>${i + 1}. ${s.name}</p>`);
      if (done) inner += '<p class="good">已竣工。</p>';
      else if (st.building) inner += bar(st.t / sd.time, '施工中：' + sd.name);
      else if (sd) inner += btn('投入：' + sd.name, 'proj', p.id, { disabled: !G.canPay(sd.cost), sub: costHtml(sd.cost) });
      return box(p.name, inner, named(p.name, G.projDesc(p) + '<br>以最先竣工落成的那一座为准，路线将就此锁定。'));
    }).join('');
  }

  const TABS = { settle: tabSettle, explore: tabExplore, research: tabResearch, project: tabProject };

  /* ---------- 其余面板 ---------- */
  function buffHtml() {
    const rows = G.S.buffs.map(b => {
      const d = G.def('buffs', b.id); if (!d) return '';
      const frac = b.t !== null && d.duration ? Math.max(0, Math.min(1, b.t / d.duration)) : 1;
      return `<div class="buff ${d.good === false ? 'neg' : 'pos'}"${dyn('buff', b.id)}><i style="width:${(frac * 100).toFixed(2)}%"></i>
        <span class="grow">${d.name}${b.stacks > 1 ? ' ×' + b.stacks : ''}</span><span>${tm(b.t)}</span></div>`;
    }).join('');
    return box('状态', rows);
  }

  function stockHtml() {
    const S = G.S, groups = G.cfg.groups || { basic: '物资' };
    let h = buffHtml();
    const env = G.env(), w = G.warmth();
    const pop = S.pop ? `<div class="row"${dyn('pop', '')}><span class="grow">人口</span><span>${S.pop}<em>/${G.D.housing}</em></span></div>
      <div class="row"${dyn('pop', '')}><span class="grow">闲置</span><span>${G.idle()}</span></div>
      ${G.away() ? `<div class="row"${dyn('pop', '')}><span class="grow">外出</span><span>${G.away()}</span></div>` : ''}
      <div class="row"${dyn('warm', '')}><span class="grow">温度</span><span>${env.temp}° ${w >= 1 ? '温暖' : w > 0.5 ? '微寒' : '严寒'}</span></div>` : '';
    h += box('聚落', pop);
    for (const g in groups) {
      const rows = G.list('resources').filter(r => (r.group || 'basic') === g && S.seen[r.id]).map(r =>
        `<div class="row"${dyn('res', r.id)}><span class="grow">${r.name}</span><span>${G.fmt(S.res[r.id] || 0)}${r.group === 'relic' ? '' : `<em>/${G.cap(r.id)}</em>`}</span></div>`).join('');
      h += box(groups[g], rows);
    }
    if (new URLSearchParams(location.search).has('debug')) h += box('调试', `<p class="info">科技 ${S.align.tech} 魔法 ${S.align.magic} 宗教 ${S.align.faith}<br>路线 ${S.route || '-'}</p>`);
    return h;
  }

  function eventHtml() {
    const a = G.S.ev.active; if (!a) return '';
    const ev = G.def('events', a.id), txt = G.val(ev.text);
    let h = `<div class="modal"><h2>${G.val(ev.title)}</h2><div class="text">${String(txt).split('\n').map(p => `<p>${p}</p>`).join('')}</div>`;
    if (a.result !== null) {
      h += a.result ? `<div class="text result">${a.result}</div>` : '';
      h += btn(a.next ? '继续' : '关闭', 'close', '');
    } else h += (ev.choices || []).map((c, i) => G.ok(c.requires) || c.showLocked ?
      btn(G.val(c.text), 'choose', i, { disabled: !G.choiceOk(c), sub: costHtml(c.cost), tip: c.tip }) : '').join('');
    return h + '</div>';
  }

  /* ---------- 悬浮提示框 ---------- */
  function tipHtmlOf(el) {
    if (el.dataset.tip) return el.dataset.tip;
    const t = el.dataset.tipt; return t && TIPS[t] ? TIPS[t](el.dataset.tipa) : '';
  }
  function showTip() {
    const tip = $('tip'), h = ui.hover;
    if (!h || !document.body.contains(h.el)) { tip.classList.remove('show'); ui.hover = null; return; }
    const html = tipHtmlOf(h.el);
    if (!html) { tip.classList.remove('show'); return; }
    if (tip._html !== html) { tip.innerHTML = html; tip._html = html; }
    tip.classList.add('show');
    const pad = 14, w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = h.x + pad, y = h.y + pad;
    if (x + w > innerWidth - 4) x = Math.max(4, h.x - w - pad);
    if (y + hh > innerHeight - 4) y = Math.max(4, h.y - hh - pad);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mousemove', ev => {
    const el = ev.target.closest && ev.target.closest('[data-tip],[data-tipt]');
    ui.hover = el ? { el, x: ev.clientX, y: ev.clientY } : null;
    showTip();
  });
  document.addEventListener('mouseleave', () => { ui.hover = null; showTip(); });

  G.render = function () {
    const S = G.S;
    if (!S) return;
    const env = G.env();
    document.body.classList.toggle('night', env.night);
    $('clock').textContent = `第${env.day}日 · ${env.phase}　${env.temp}°`;
    const tabs = G.list('tabs').filter(t => G.ok(t.requires));
    if (!tabs.find(t => t.id === ui.tab)) ui.tab = 'settle';
    put('tabs', tabs.map(t => `<span class="tab${t.id === ui.tab ? ' on' : ''}" data-act="tab" data-arg="${t.id}">${t.name}</span>`).join(''));
    put('panel', TABS[ui.tab]());
    put('stock', stockHtml());
    put('log', S.log.map((l, i) => `<p class="${l.cls}" style="opacity:${Math.max(0.25, 1 - i * 0.07)}">${l.text}</p>`).join(''));
    put('overlay', eventHtml());
    $('overlay').classList.toggle('show', !!S.ev.active);
    showTip(); // 悬停中的提示随数值实时刷新
  };

  /* ---------- 输入 ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.classList.contains('disabled')) return;
    const a = el.dataset.act, arg = el.dataset.arg;
    switch (a) {
      case 'tab': ui.tab = arg; break;
      case 'action': G.doAction(arg); break;
      case 'build': G.build(arg); break;
      case 'job+': G.setJob(arg, 1); break;
      case 'job-': G.setJob(arg, -1); break;
      case 'research': G.startResearch(arg); break;
      case 'proj': G.startProjStage(arg); break;
      case 'party+': ui.party[arg] = Math.min((ui.party[arg] || 1) + 1, Math.max(1, G.idle())); break;
      case 'party-': ui.party[arg] = Math.max(1, (ui.party[arg] || 1) - 1); break;
      case 'exp-go': G.startExpedition(arg, Math.min(ui.party[arg] || 1, G.idle())); break;
      case 'exp-search': G.expAction(+arg, 'search'); break;
      case 'exp-back': G.expAction(+arg, 'back'); break;
      case 'choose': G.choose(+arg); break;
      case 'close': G.closeEvent(); break;
      case 'save': G.save(); G.log('已保存。'); break;
      case 'reset': if (confirm('确定清除存档并重新开始？')) G.reset(); break;
    }
    G.render();
  });
  document.addEventListener('DOMContentLoaded', () => G.init());
})(window.Game);
