/* 文明奠基工程：route 路线；stages 每阶段 {name,cost,time秒}；最先全部竣工者锁定路线并进入第二阶段，onComplete 为竣工效果 */
Game.define('projects', [
  { id: 'steam_core', route: 'tech', name: '一号蒸汽鼓风中枢', desc: '以白灰掺炼抗蚀高压锅炉，点燃蒸汽核心。',
    stages: [
      { name: '夯筑耐火砖基座', desc: '石料、黏土', cost: { stone: 60, wood: 30 }, time: 20 },
      { name: '冶炼抗蚀高压锅炉', desc: '精铁、煤炭、白灰', cost: { iron: 12, coal: 20, ash: 8 }, time: 25 },
      { name: '安装气缸与鼓风管网', desc: '黄铜零件、技工', cost: { iron: 12, coal: 10 }, time: 25 },
    ], onComplete: { flags: ['route_tech'], event: 'stage2_tech' } },
  { id: 'alchemy_hall', route: 'magic', name: '大炼金烘炉与附魔仪轨厅', desc: '以白灰为触媒，让造物与灰同源。',
    stages: [
      { name: '铺设几何仪式基座', desc: '石料、白灰', cost: { stone: 60, ash: 10 }, time: 20 },
      { name: '铸造炼金蒸馏烘炉', desc: '精铁、草药', cost: { iron: 12, ash: 10 }, time: 25 },
      { name: '镌刻附魔铭文', desc: '白灰、附魔师', cost: { ash: 20, stone: 20 }, time: 25 },
    ], onComplete: { flags: ['route_magic'], event: 'stage2_magic' } },
  { id: 'vigil_altar', route: 'faith', name: '余烬守夜大圣坛', desc: '以齐声祈祷与不灭圣火，与白灰共鸣。',
    stages: [
      { name: '垒砌环形苦修石墙', desc: '石料、木材', cost: { stone: 70, wood: 40 }, time: 20 },
      { name: '铸造不灭圣火铜盆', desc: '精铁', cost: { iron: 15, wood: 20 }, time: 25 },
      { name: '镌刻守望圣典碑文', desc: '燃料、守夜传教士', cost: { coal: 15, food: 30 }, time: 25 },
    ], onComplete: { flags: ['route_faith'], event: 'stage2_faith' } },
]);
