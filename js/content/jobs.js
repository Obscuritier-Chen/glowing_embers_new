/* 岗位：produce/consume 为「每名工人每秒」；research 为每名工人每秒推进的研究进度 */
Game.define('jobs', [
  { id: 'woodcutter', name: '拾荒者', desc: '+枯木', produce: { wood: 0.25 } },
  { id: 'forager', name: '采集者', desc: '+口粮', produce: { food: 0.3 } },
  { id: 'quarryman', name: '采石工', desc: '+碎石', produce: { stone: 0.2 } },
  { id: 'miner', name: '矿工', desc: '+煤块', produce: { coal: 0.15 } },
  { id: 'farmer', name: '农夫', desc: '+口粮', produce: { food: 0.6 } },
  { id: 'smith', name: '铁匠', desc: '煤块 → 生铁', consume: { coal: 0.1 }, produce: { iron: 0.08 } },
  { id: 'scholar', name: '学者', desc: '+研究笔记，推进研究', produce: { notes: 0.03 }, research: 1 },
]);
