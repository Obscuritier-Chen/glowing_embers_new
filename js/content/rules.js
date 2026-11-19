/* 生存规则：每帧(run(S,G,dt))或每隔 every 秒执行的自定义逻辑，用于粮食、人口、严寒等平衡性机制 */
Game.rule({ id: 'eat', run(S, G, dt) {
  if (!S.pop) return;
  const need = S.pop * 0.04 * dt;
  if ((S.res.food || 0) >= need) { G.take('food', need); S.starve = 0; return; }
  G.take('food', S.res.food || 0);
  S.starve = (S.starve || 0) + dt;
  if (S.starve > 25) { S.starve = 0; G.addPop(-1); G.log('有人在饥饿中倒下了。', 'bad'); }
} });

Game.rule({ id: 'immigrate', every: 12, run(S, G) {
  if (!S.fire_seen && !S.flags.fire_lit) return;
  if (S.pop < G.D.housing && (S.res.food || 0) > 3 && G.warmth() >= 0.5 && G.chance(0.7)) {
    S.pop++;
    G.log(G.pick(['一个裹着破毯子的身影循着火光走来。', '有人在灰雾里望见了你们的火，留了下来。', '一对兄妹怯生生地靠近了篝火。']));
  }
} });

Game.rule({ id: 'cold', every: 20, run(S, G) {
  if (S.pop && G.env().temp < -5 && G.warmth() < 0.5 && G.chance(0.5)) {
    G.addPop(-1); G.log('寒夜带走了一个人。火不够旺。', 'bad');
  }
} });
