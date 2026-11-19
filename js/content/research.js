/* 研究：cost 立项消耗（含遗物）、time 攻关进度量（学者每人每秒 1）、requires 前置、effects 完成效果。
   新建筑/资源由建筑的 requires:{research:[..]} 自动解锁，无需在此重复登记。 */
Game.define('research', [
  { id: 'scouting', name: '荒原踏查', desc: '派人走出火光，探索近郊荒原。', cost: { food: 8 }, time: 15 },
  { id: 'prospecting', name: '浅层地质勘探', desc: '解锁煤坑与煤块。', cost: { notes: 1, wood: 10 }, time: 25 },
  { id: 'three_field', name: '三圃轮作与重犁', desc: '解锁轮作农田。', cost: { notes: 2, wood: 20 }, time: 35 },
  { id: 'wind_power', name: '水利与风力传动', desc: '解锁风车磨坊。', cost: { notes: 3, wood: 30 }, time: 45, requires: { research: ['three_field'] } },
  { id: 'smelting', name: '高炉锻铁', desc: '解锁铁匠铺，煤块炼成生铁。', cost: { notes: 3, coal: 10, stone: 10 }, time: 45, requires: { research: ['prospecting'] } },
  { id: 'guild_arch', name: '行会石木建筑学', desc: '解锁石砌排屋与市政厅。', cost: { notes: 4, stone: 30 }, time: 50, requires: { research: ['wind_power'] } },
  { id: 'relic_study', name: '旧世遗物研读', desc: '瓶颈课题示例：必须持有前文明遗物。研究速度 +25%。',
    cost: { notes: 3, relic_governor: 1 }, time: 40, requires: { research: ['scouting'] }, effects: { mods: { research: 0.25 }, align: { tech: 1 } } },
]);
