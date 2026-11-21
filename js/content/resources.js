/* 资源与前文明遗物（遗物同样是资源，group:'relic'，因此可直接写进研究/事件的消耗里） */
Game.define('resources', [
  { id: 'wood', name: '枯木', desc: '风化后发脆的木头，篝火与建造的基础。' },
  { id: 'stone', name: '碎石' },
  { id: 'food', name: '口粮', desc: '全体人口每秒都要进食。' },
  { id: 'coal', name: '煤块' },
  { id: 'iron', name: '生铁' },
  { id: 'ash', name: '白灰' },
  { id: 'notes', name: '研究笔记' },

  { id: 'relic_governor', name: '生锈的瓦特离心调速器', group: 'relic', cap: 99, desc: '旧世蒸汽机上的转速调节装置，齿轮间卡着灰。' },
  { id: 'relic_codebook', name: '半本手写电报密码簿', group: 'relic', cap: 99, desc: '字迹被白灰熏黄，另一半早已化为粉末。' },
]);
