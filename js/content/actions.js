/* 手动行动：cost 消耗、effects 效果（同 Game.apply）、cooldown 冷却秒、logs 随机日志 */
Game.define('actions', [
  { id: 'light_fire', name: '点燃篝火', cost: { wood: 5 }, requires: { has: { wood: 3 }, notFlags: ['fire_lit'] },
    effects: { bld: { campfire: 1 }, flags: ['fire_lit'], log: '火苗舔上枯枝，旷野里有了第一点暖意。' } },
  { id: 'gather_wood', name: '拾取枯木', cooldown: 2, effects: { res: { wood: [3, 6] } },
    logs: ['风把枯枝吹成了一堆。', '你在白灰里翻出几截发脆的木头。'] },
  { id: 'forage', name: '采集野果', cooldown: 4, requires: { flags: ['fire_lit'] }, effects: { res: { food: [2, 5] } },
    logs: ['几颗耐寒的野果，挂着灰霜。', '雪下的块茎还没有烂透。'] },
  { id: 'scoop_ash', name: '收集白灰', cooldown: 5, requires: { bld: { hut: 1 } }, effects: { res: { ash: [1, 3] } },
    logs: ['白灰在指缝间簌簌流下，像不会融化的雪。'] },
  { id: 'dig_stone', name: '敲取碎石', cooldown: 4, requires: { bld: { hut: 1 } }, effects: { res: { stone: [2, 4] } } },
]);
