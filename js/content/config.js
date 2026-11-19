/* 全局配置、页签、探索环带名称 */
Game.config({
  baseCap: 100,
  costMult: 1.15,
  dayLength: 120,
  phases: ['清晨', '白昼', '黄昏', '深夜'],
  temp: t => Math.round(-8 + 6 * Math.sin(t / 120 * Math.PI * 2 - 1.2)), // 环境温度
  heatPerPop: 1,
  eventInterval: 25,
  eventChance: 0.6,
  eventCooldown: 180,
  alignThreshold: 6,           // 倾向点数达到此值，对应奠基工程开放（正式版调高）
  groups: { basic: '物资', relic: '前文明遗物' },
  rings: { 1: '近郊荒原', 2: '苍茫腹地', 3: '绝境深渊' },
  start: { res: {}, flags: {} },
});

Game.define('tabs', [
  { id: 'settle', name: '聚落' },
  { id: 'explore', name: '荒原', requires: { research: ['scouting'] } },
  { id: 'research', name: '研究', requires: { bld: { drafting_table: 1 } } },
  { id: 'project', name: '奠基', requires: { flags: ['tab_project'] } },
]);
