/* 余烬微光 —— 界面：状态 → HTML 字符串 → 轻量 DOM 对比更新（保证按钮点击不被重绘打断） */
(function (G) {
  'use strict';
  const ui = (G.ui = { tab: 'settle', party: {} });
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

  /* ---------- 组件 ---------- */
  function btn(label, act, arg, o) {
    o = o || {};
    const dis = o.disabled ? ' disabled' : '';
    const bar = o.bar !== undefined ? `<i class="bar" style="width:${Math.round(o.bar * 100)}%"></i>` : '';
    return `<div class="btn${dis}${o.cls ? ' ' + o.cls : ''}" data-act="${act}" data-arg="${esc(arg === undefined ? '' : arg)}">${bar}<b>${label}</b>` +
      (o.sub ? `<small>${o.sub}</small>` : '') + `</div>`;
  }
  const costHtml = cost => Object.keys(cost || {}).map(k =>
    `<span class="${(G.S.res[k] || 0) >= cost[k] ? '' : 'lack'}">${G.name(k)} ${G.fmt(cost[k])}</span>`).join(' ');
  const box = (title, inner) => inner ? `<div class="box"><h3>${title}</h3>${inner}</div>` : '';
  const bar = (p, txt) => `<div class="pbar"><i style="width:${Math.min(100, Math.round(p * 100))}%"></i><span>${txt || ''}</span></div>`;

  /* ---------- 各页签 ---------- */
  function tabSettle() {
    const S = G.S;
    const acts = G.list('actions').filter(a => G.ok(a.requires) || S.cd[a.id] > 0).map(a =>
      btn(a.name, 'action', a.id, { disabled: !G.actionOk(a), sub: costHtml(a.cost), bar: a.cooldown ? (S.cd[a.id] || 0) / a.cooldown : undefined })).join('');
    const blds = G.list('buildings').filter(G.buildingVisible).map(b => {
      const n = S.bld[b.id] || 0;
      return btn(`${b.name}${n ? ' ×' + n : ''}`, 'build', b.id, { disabled: !G.canBuild(b), sub: (b.max && n >= b.max ? '已建成' : costHtml(G.bCost(b))), tip: b.desc }) +
        (b.desc ? `<p class="desc">${b.desc}</p>` : '');
    }).join('');
    const jobs = G.list('jobs').filter(j => (G.D.slots[j.id] || 0) > 0 || S.jobs[j.id]).map(j => {
      const w = S.jobs[j.id] || 0, sl = G.D.slots[j.id] || 0;
      return `<div class="row"><span class="grow">${j.name} <em>${w}/${sl}</em><small>${j.desc || ''}</small></span>
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
      h += box(`探索队 · ${n.name}（${e.members}人）`, `${st}<p class="desc">口粮余量 ${f1(e.supply)}　背包：${bag}</p>`);
    }
    const idle = G.idle();
    const groups = {};
    for (const n of G.list('nodes')) if (G.nodeVisible(n)) (groups[n.ring || 1] = groups[n.ring || 1] || []).push(n);
    for (const r in groups) {
      h += box(rings[r] || '荒原', groups[r].map(n => {
        const ns = S.nodes[n.id] || { p: 0 }, k = Math.max(1, Math.min(ui.party[n.id] || 1, idle || 1));
        const out = S.exps.some(e => e.node === n.id);
        return `<div class="node"><div class="row"><span class="grow"><b>${n.name}</b> <em>${Math.round(ns.p)}%</em><small>${n.desc || ''}</small></span></div>
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
        `<p class="desc">研究速度 ${f1(G.researchRate())}/秒（分配学者以加快）</p>`);
    }
    h += box('可研究课题', G.list('research').filter(G.researchAvailable).map(r => {
      const started = R.progress[r.id] !== undefined, cur = R.current === r.id;
      return btn(r.name + (cur ? '（进行中）' : started ? '（已立项）' : ''), 'research', r.id,
        { disabled: cur || (!started && !G.canPay(r.cost)), sub: started ? '继续攻关' : costHtml(r.cost) }) + `<p class="desc">${r.desc || ''}</p>`;
    }).join(''));
    const done = Object.keys(R.done).map(id => G.def('research', id).name);
    h += box('已完成', done.length ? `<p class="desc">${done.join('　')}</p>` : '');
    return h;
  }

  function tabProject() {
    const S = G.S;
    if (!S.routes.length) return '';
    return G.list('projects').map(p => {
      const st = G.projState(p.id), done = S.route === p.route;
      if (!G.projAvailable(p) && !done) return '';
      const sd = p.stages[st.stage];
      let inner = `<p class="desc">${p.desc}</p>`;
      p.stages.forEach((s, i) => inner += `<p class="stage ${i < st.stage ? 'done' : ''}">${i + 1}. ${s.name}　<small>${s.desc || ''}</small></p>`);
      if (done) inner += '<p class="good">已竣工。</p>';
      else if (st.building) inner += bar(st.t / sd.time, '施工中：' + sd.name);
      else if (sd) inner += btn('投入：' + sd.name, 'proj', p.id, { disabled: !G.canPay(sd.cost), sub: costHtml(sd.cost) });
      return box(p.name, inner);
    }).join('') + '<p class="desc">以最先竣工落成的那一座为准，路线将就此锁定。</p>';
  }

  const TABS = { settle: tabSettle, explore: tabExplore, research: tabResearch, project: tabProject };

  /* ---------- 其余面板 ---------- */
  function stockHtml() {
    const S = G.S, groups = G.cfg.groups || { basic: '物资' };
    let h = '';
    for (const g in groups) {
      const rows = G.list('resources').filter(r => (r.group || 'basic') === g && S.seen[r.id]).map(r =>
        `<div class="row"><span class="grow">${r.name}</span><span>${G.fmt(S.res[r.id] || 0)}${r.group === 'relic' ? '' : `<em>/${G.cap(r.id)}</em>`}</span></div>`).join('');
      h += box(groups[g], rows);
    }
    const env = G.env(), w = G.warmth();
    const pop = S.pop ? `<div class="row"><span class="grow">人口</span><span>${S.pop}<em>/${G.D.housing}</em></span></div>
      <div class="row"><span class="grow">闲置</span><span>${G.idle()}</span></div>
      ${G.away() ? `<div class="row"><span class="grow">外出</span><span>${G.away()}</span></div>` : ''}
      <div class="row"><span class="grow">温度</span><span>${env.temp}° ${w >= 1 ? '温暖' : w > 0.5 ? '微寒' : '严寒'}</span></div>` : '';
    h = box('聚落', pop) + h;
    if (new URLSearchParams(location.search).has('debug')) h += box('调试', `<p class="desc">科技 ${S.align.tech} 魔法 ${S.align.magic} 宗教 ${S.align.faith}<br>路线 ${S.route || '-'}</p>`);
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
      btn(G.val(c.text), 'choose', i, { disabled: !G.choiceOk(c), sub: costHtml(c.cost) }) : '').join('');
    return h + '</div>';
  }

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
  };

  /* ---------- 输入 ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.classList.contains('disabled')) return;
    const a = el.dataset.act, arg = el.dataset.arg, S = G.S;
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
