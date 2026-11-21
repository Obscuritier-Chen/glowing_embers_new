/* Buff（增益/减益）：
   good:false 为负面；duration 秒，省略 = 永久；stack:'refresh'(默认,刷新时长)|'stack'(叠层)|'ignore'
   effects: [{key, pct}]   百分比，0.2 = +20%，-0.2 = -20%
            [{key, flat}]  固定数值（资源为每秒；pop:housing/pop:heat/cap:资源 为直接加减）
   key：res:资源(产出%/固定每秒)  job:岗位  bld:建筑  research  travel  build
        pop:eat(口粮消耗%)  pop:immigrate(移民几率%)  pop:housing(人口上限)  pop:heat(供暖)  cap:资源(容量)
   事件/研究等的 effects 中用 buff:'id' 或 buff:{id,duration} 授予，removeBuff:'id' 移除。 */
Game.define('buffs', [
  { id: 'ash_cough', name: '灰咳', good: false, duration: 150, desc: '灰雾钻进了许多人的肺里，大家干咳不止，无心劳作。',
    effects: [{ key: 'research', pct: -0.25 }, { key: 'job:forager', pct: -0.2 }, { key: 'pop:eat', pct: 0.1 }] },
  { id: 'filter_masks', name: '炭纱面罩', good: true, desc: '多层棉纱与木炭做的面罩成了矿工的标配。（永久）',
    effects: [{ key: 'res:coal', pct: 0.15 }] },
  { id: 'tonic', name: '苦艾灵药', good: true, duration: 180, desc: '白灰触媒蒸馏的灵药让人头脑清明。',
    effects: [{ key: 'research', pct: 0.25 }, { key: 'pop:immigrate', pct: 0.2 }] },
  { id: 'vigil_comfort', name: '守夜余温', good: true, duration: 240, desc: '低沉的诵经声让篝火边的人们安心。',
    effects: [{ key: 'pop:heat', flat: 3 }, { key: 'pop:immigrate', pct: 0.5 }] },
  { id: 'rust_loss', name: '轴承锈蚀', good: false, duration: 150, desc: '风车磨损，磨坊效率大减。',
    effects: [{ key: 'job:farmer', pct: -0.3 }] },
  { id: 'carpenter', name: '流浪木匠', good: true, desc: '收留的木匠总能顺手修出些木料。（永久，固定每秒）',
    effects: [{ key: 'res:wood', flat: 0.15 }] },
  { id: 'scholar_legacy', name: '老学者的遗泽', good: true, desc: '手札里的思路仍在启发每一位学者。（永久）',
    effects: [{ key: 'research', pct: 0.15 }] },
]);

/* 状态型 buff：由 rules.js 的 status 规则按聚落状态自动授予/移除（silent 不写日志，managed 仅作标注） */
Game.define('buffs', [
  { id: 'relic_insight', name: '旧世的启发', good: true, desc: '研读前文明遗物带来的新思路。（永久）', effects: [{ key: 'research', pct: 0.25 }] },
  { id: 'hunger', name: '饥饿', good: false, managed: true, desc: '口粮耗尽，所有人饿着肚子干活。持续太久会有人倒下。',
    effects: [{ key: 'job:*', pct: -0.3 }, { key: 'research', pct: -0.3 }] },
  { id: 'chilly', name: '寒冷', good: false, managed: true, desc: '供暖不足，手指冻得发僵。',
    effects: [{ key: 'job:*', pct: -0.15 }] },
  { id: 'freezing', name: '严寒', good: false, managed: true, desc: '火太弱了。人们挤在一起发抖，没有流民愿意靠近；寒夜会夺走生命。',
    effects: [{ key: 'job:*', pct: -0.3 }, { key: 'pop:immigrate', pct: -1 }] },
]);
