/* 生存规则：每帧(run(S,G,dt))或每隔 every 秒执行的自定义逻辑。
   聚落状态（饥饿/寒冷/严寒）统一走 buff：status 规则按条件授予/移除，数值惩罚写在 buffs.js，不再硬编码。
   rates:{资源id: (S,G)=>每秒净值(负=消耗)} 可选，用于资源悬浮提示的来源明细；label 为来源名。 */

// 把「条件」映射为「应当存在的 buff」，条件变化时自动授予/移除
function syncBuff(G, id, on) { if (on !== G.hasBuff(id)) on ? G.addBuff(id) : G.removeBuff(id); }

Game.rule({ id: 'status', run(S, G) {
  if (!S.pop) { ['hunger', 'chilly', 'freezing'].forEach(id => syncBuff(G, id, false)); return; }
  const w = G.warmth();
  syncBuff(G, 'hunger', (S.res.food || 0) < 0.01);
  syncBuff(G, 'freezing', w < 0.5);
  syncBuff(G, 'chilly', w >= 0.5 && w < 1);
} });

Game.rule({ id: 'eat', label: '人口口粮',
  rates: { food: (S, G) => -S.pop * 0.04 * G.mod('pop:eat') },
  run(S, G, dt) {
    if (!S.pop) return;
    const need = S.pop * 0.04 * G.mod('pop:eat') * dt;
    if ((S.res.food || 0) >= need) { G.take('food', need); S.starve = 0; return; }
    G.take('food', S.res.food || 0);
    S.starve = (S.starve || 0) + dt;
    if (S.starve > 25) { S.starve = 0; G.addPop(-1); G.log('有人在饥饿中倒下了。', 'bad'); }
  } });

Game.rule({ id: 'immigrate', every: 12, run(S, G) {
  // 严寒 buff 会把 pop:immigrate 压到 0，因此这里不再硬编码温度判断
  if (S.pop < G.D.housing && (S.res.food || 0) > 3 && G.chance(Math.min(1, 0.7 * G.mod('pop:immigrate')))) {
    S.pop++;
    G.log(G.pick(['一个裹着破毯子的身影循着火光走来。', '有人在灰雾里望见了你们的火，留了下来。', '一对兄妹怯生生地靠近了篝火。']));
  }
} });

Game.rule({ id: 'cold', every: 20, run(S, G) {
  if (S.pop && G.hasBuff('freezing') && G.env().temp < -5 && G.chance(0.5)) {
    G.addPop(-1); G.log('寒夜带走了一个人。火不够旺。', 'bad');
  }
} });
