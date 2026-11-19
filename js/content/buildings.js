/* 建筑：cost 基础造价（按 costMult^已建数 递增）、housing 人口上限、storage 仓储、slots 岗位槽位、
   heat 供暖、produce/consume 每秒被动产耗、mods 全局加成、requires 解锁条件、max 上限、onBuild 建成效果 */
Game.define('buildings', [
  { id: 'campfire', name: '微光篝火', desc: '燃烧枯木，驱散寒意。', cost: { wood: 5 }, max: 1, requires: { flags: ['__hidden'] },
    housing: 2, heat: 8, consume: { wood: 0.05 }, slots: { woodcutter: 2 } },
  { id: 'hut', name: '简陋窝棚', desc: '可住 2 人。', cost: { wood: 12 }, costMult: 1.2, requires: { bld: { campfire: 1 } }, housing: 2, heat: 1 },
  { id: 'woodshed', name: '储木棚', desc: '增加物资容量。', cost: { wood: 30 }, requires: { bld: { hut: 2 } },
    storage: { wood: 100, stone: 100, food: 100, coal: 100, iron: 100, ash: 100, notes: 100 } },
  { id: 'forager_camp', name: '采集棚', desc: '提供采集者岗位。', cost: { wood: 20 }, requires: { bld: { hut: 1 } }, slots: { forager: 2 } },
  { id: 'quarry', name: '采石坑', desc: '提供采石工岗位。', cost: { wood: 30 }, requires: { bld: { hut: 2 } }, slots: { quarryman: 2 } },
  { id: 'drafting_table', name: '简陋绘图桌', desc: '学者在此推演，开启研究。', cost: { wood: 40, stone: 10 }, max: 1, requires: { pop: 3 }, slots: { scholar: 1 } },

  { id: 'coal_pit', name: '煤坑', desc: '浅层煤层。', cost: { wood: 40, stone: 20 }, requires: { research: ['prospecting'] }, slots: { miner: 2 } },
  { id: 'field', name: '轮作农田', desc: '黑麦与块茎轮作。', cost: { wood: 40, stone: 15 }, requires: { research: ['three_field'] }, slots: { farmer: 2 } },
  { id: 'windmill', name: '风车磨坊', desc: '农夫产出 +25%。', cost: { wood: 80, stone: 40 }, requires: { research: ['wind_power'] }, mods: { 'job:farmer': 0.25 } },
  { id: 'smithy', name: '高炉铁匠铺', cost: { wood: 60, stone: 60 }, requires: { research: ['smelting'] }, slots: { smith: 1 } },
  { id: 'stone_row', name: '石砌排屋', desc: '可住 6 人，更保暖。', cost: { wood: 40, stone: 80 }, requires: { research: ['guild_arch'] }, housing: 6, heat: 2 },
  { id: 'town_hall', name: '市政厅', desc: '学者与行会议事之所。', cost: { wood: 80, stone: 100 }, max: 1, requires: { research: ['guild_arch'] }, slots: { scholar: 3 }, housing: 2 },

  // —— 第二阶段示例：路线专属建筑（requires.route 控制） ——
  { id: 'steam_boiler', name: '蒸汽锅炉房', desc: '【科技】抗蚀特种钢锻造的锅炉。', cost: { iron: 30, coal: 30 }, requires: { route: 'tech' }, heat: 20, consume: { coal: 0.1 } },
  { id: 'alembic', name: '炼金蒸馏工坊', desc: '【魔法】白灰触媒蒸馏灵药。', cost: { stone: 60, ash: 30 }, requires: { route: 'magic' }, heat: 10, consume: { ash: 0.02 } },
  { id: 'vigil_hall', name: '守夜祈祷所', desc: '【宗教】圣咏与白灰共鸣，温暖整座聚落。', cost: { stone: 80, wood: 40 }, requires: { route: 'faith' }, heat: 15, housing: 4 },
]);
