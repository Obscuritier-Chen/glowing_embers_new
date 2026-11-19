/* 资源与前文明遗物（遗物同样是资源，group:'relic'，因此可直接写进研究/事件的消耗里） */
Game.define('resources', [
  { id: 'wood', name: '枯木' },
  { id: 'stone', name: '碎石' },
  { id: 'food', name: '口粮' },
  { id: 'coal', name: '煤块' },
  { id: 'iron', name: '生铁' },
  { id: 'ash', name: '白灰' },
  { id: 'notes', name: '研究笔记' },

  { id: 'relic_governor', name: '生锈的瓦特离心调速器', group: 'relic', cap: 99 },
  { id: 'relic_codebook', name: '半本手写电报密码簿', group: 'relic', cap: 99 },
]);
