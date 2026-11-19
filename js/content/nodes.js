/* 探索节点：ring 环带、travel 单程秒数、supply 每人携带口粮、searchCost 每人每次搜刮口粮、searchTime 搜刮耗时、
   step 每次搜刮增加的探索度%、loot 掉落表（遗物同为资源）、danger 每次搜刮失去一人概率、events 触发事件、onExplored 探明效果 */
Game.define('nodes', [
  { id: 'dead_wood', name: '枯木林', ring: 1, desc: '风化的树干立成一片灰白的林子。', travel: 15, supply: 2, searchCost: 0.5, step: 25,
    loot: [{ res: 'wood', min: 10, max: 25 }, { res: 'food', min: 2, max: 6, chance: 0.5 }, { res: 'ash', min: 1, max: 3, chance: 0.4 }] },
  { id: 'river_mouth', name: '暗河出水口', ring: 1, desc: '地下暗河在此涌出，水面浮着一层灰。', travel: 20, supply: 3, searchCost: 1, step: 25,
    requires: { has: { wood: 20 } },
    loot: [{ res: 'food', min: 4, max: 10 }, { res: 'stone', min: 5, max: 12, chance: 0.6 }] },
  { id: 'rail_shed', name: '废弃扳道房', ring: 1, desc: '锈迹斑斑的铁轨延伸进灰雾。', travel: 25, supply: 3, searchCost: 1, step: 20, danger: 0.04,
    requires: { has: { stone: 10 } },
    loot: [{ res: 'iron', min: 2, max: 6, chance: 0.6 }, { res: 'coal', min: 3, max: 8, chance: 0.6 },
           { res: 'relic_governor', min: 1, max: 1, chance: 0.15 }, { res: 'relic_codebook', min: 1, max: 1, chance: 0.08 }],
    events: [{ event: 'scholar_1', chance: 0.25, once: true }] },
  { id: 'collapsed_mine', name: '坍塌煤矿', ring: 1, desc: '塌陷的矿口还有未采尽的煤。', travel: 30, supply: 4, searchCost: 1.5, step: 25, danger: 0.06,
    requires: { research: ['prospecting'] },
    loot: [{ res: 'coal', min: 8, max: 20 }, { res: 'iron', min: 1, max: 4, chance: 0.4 }] },
  // 第二环示例：由 stage 门禁
  { id: 'ruined_city', name: '风化工业城废墟', ring: 2, desc: '（第二阶段开放）', travel: 60, supply: 6, searchCost: 2, step: 10, danger: 0.1,
    requires: { stage: 2 }, loot: [{ res: 'iron', min: 10, max: 30 }, { res: 'relic_governor', min: 1, max: 1, chance: 0.3 }] },
]);
