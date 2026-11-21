/* 事件
   type: 'single'(默认，随机触发) | 'milestone'(条件满足必触发一次) | 'manual'(仅由其他事件/探索/预约触发，用于事件链)
   requires: 触发条件；weight 权重；cooldown 冷却秒；once 只发生一次
   choices[]: { text, cost, requires, effects(同 Game.apply，含 align 隐式倾向), result 结果文字, next 紧接着触发的事件, schedule:{event,delay} 若干秒后的下一幕 } */
Game.define('events', [
  /* ===== 进程推进事件 ===== */
  { id: 'intro', type: 'milestone', title: '旷野微光', text: '苍白的荒原望不到头。风里没有声音，只有白灰无休止地落下。\n你蹲在地上，手边只有几根发脆的枯枝。',
    choices: [{ text: '开始', result: '' }] },
  { id: 'winter_crossroads', type: 'milestone', title: '长冬将至：文明的十字路口',
    requires: { research: ['guild_arch'], pop: 6 },
    text: '观测者在夜里喊醒了所有人：灰云正在北方堆叠，一场数十年一遇的漫长灰冬即将来临。\n壁炉、风车与普通铁器，都撑不过这一次。聚落需要一座世代传承的中枢建筑。',
    choices: [{ text: '召集工匠，商议奠基工程', effects: { flags: ['tab_project'], unlockRoutes: true }, result: '「奠基」页签已开启。你所积累的倾向，决定了可以立项的工程。' }] },

  /* ===== 单次事件（隐式倾向积累） ===== */
  { id: 'cough', title: '灰雾引起的咳疾', requires: { pop: 3 }, weight: 2, cooldown: 400,
    text: '灰雾钻进了几个人的肺里，窝棚里整夜都是干咳声。',
    choices: [
      { text: '用木炭与棉纱缝制多层面罩', cost: { wood: 8 }, effects: { align: { tech: 2 }, buff: 'filter_masks' }, result: '面罩挡住了大部分灰尘，咳声渐渐稀了。' },
      { text: '以白灰为触媒，蒸馏苦艾炼制镇咳药', cost: { ash: 3 }, effects: { align: { magic: 2 }, buff: 'tonic' }, result: '药汤泛着微光，喝下去的人沉沉睡去。' },
      { text: '守夜人彻夜在火塘边诵经抚慰病患', cost: { food: 4, wood: 3 }, effects: { align: { faith: 2 }, buff: 'vigil_comfort' }, result: '低沉的诵经声里，人们竟觉得暖和了些。' },
      { text: '听天由命', effects: { pop: -1, buff: 'ash_cough' }, result: '咳声停了。也有一个人，再没有醒来。' },
    ] },
  { id: 'windmill_rust', title: '风车轴的异常锈蚀', requires: { bld: { windmill: 1 } }, weight: 2, cooldown: 400,
    text: '磨坊主发现风车主轴一夜之间爬满了白斑，铁在白灰里脆得像饼干。',
    choices: [
      { text: '试着在铁水里掺入定量白灰重铸', cost: { iron: 3, ash: 2 }, effects: { align: { tech: 2 } }, result: '新轴泛着暗哑的灰光，三天了，没有一点锈。' },
      { text: '在轴上涂抹白灰与银粉的符线', cost: { ash: 4 }, effects: { align: { magic: 2 } }, result: '符线暗了又亮。铁，似乎认下了这层灰。' },
      { text: '全体祈祷，并向风车撒下受灰礼', cost: { food: 5 }, effects: { align: { faith: 2 } }, result: '人们额上涂着灰，轴上的白斑停止了蔓延。' },
      { text: '换一根木轴凑合', cost: { wood: 20 }, effects: { buff: 'rust_loss' }, result: '木轴转得很慢，但至少不会碎。' },
    ] },
  { id: 'night_knock', title: '风雪夜的敲门声', requires: { pop: 2 }, weight: 1.5, cooldown: 300,
    text: '深夜，有人在敲窝棚的木板。外面是风雪，和一个看不清脸的身影。',
    choices: [
      { text: '开门，让他进来取暖', cost: { food: 4 }, effects: { pop: 1, align: { faith: 1 }, buff: 'carpenter' }, result: '陌生人哆嗦着喝下热水。他说自己曾是个木匠。' },
      { text: '隔着门板递出一块口粮', cost: { food: 2 }, result: '敲门声停了。清晨，门外只剩一行脚印。' },
      { text: '不予理会', result: '风声盖过了一切。' },
    ] },
  { id: 'ash_song', title: '荒原守夜人的歌谣', requires: { pop: 4, flags: ['fire_lit'] }, weight: 1, cooldown: 500,
    text: '一个路过的老守夜人在篝火旁哼起歌谣。许多人停下手里的活，静静听着。',
    choices: [
      { text: '请他留下，教大家唱', cost: { food: 3 }, effects: { align: { faith: 3 } }, result: '歌声飘出去很远。白灰落在歌声里，好像落得更轻了。' },
      { text: '记下歌词里提到的古老图样', effects: { align: { magic: 1 }, res: { notes: 1 } }, result: '你在本子上描下了那些扭曲的几何。' },
      { text: '送他些干粮，继续赶路', cost: { food: 2 }, result: '老人点点头，走进了灰色的地平线。' },
    ] },

  /* ===== 事件链：老学者的炼金手札（由探索触发，分幕预约） ===== */
  { id: 'scholar_1', type: 'manual', title: '老学者的炼金手札（一）', once: true,
    text: '在废弃的扳道房里，探索队遇见一位裹着旧大衣的老人。他怀里紧抱着一只油布包。\n「我追着灰走了很多年，」他说，「想找一个能听懂我的人。」',
    choices: [
      { text: '带他回聚落', effects: { pop: 1, flags: ['scholar_joined'] }, schedule: { event: 'scholar_2', delay: 70 }, result: '老人沉默了很久，才轻轻说了一声谢谢。' },
      { text: '给他些口粮，让他离开', cost: { food: 3 }, result: '老人抱着油布包，消失在雾里。' },
    ] },
  { id: 'scholar_2', type: 'manual', title: '老学者的炼金手札（二）', once: true,
    text: '老学者在火塘边摊开了油布包：一叠被白灰熏黄的手札，满是配方与图样。\n「铁怕灰，是因为它不认灰。让它认。」',
    choices: [
      { text: '请铁匠依手札试验合金', cost: { iron: 2, ash: 2 }, effects: { align: { tech: 3 }, res: { notes: 2 } }, schedule: { event: 'scholar_3', delay: 60 }, result: '炉里的铁水泛起一层奇异的灰晕。' },
      { text: '依手札蒸馏白灰，绘制仪式阵', cost: { ash: 4 }, effects: { align: { magic: 3 }, res: { notes: 2 } }, schedule: { event: 'scholar_3', delay: 60 }, result: '地上的粉线在夜里悄悄发亮。' },
      { text: '劝他把毕生所学交给守夜人诵读', effects: { align: { faith: 3 } }, schedule: { event: 'scholar_3', delay: 60 }, result: '老人叹了口气，终究点了头。' },
    ] },
  { id: 'scholar_3', type: 'manual', title: '老学者的炼金手札（三）', once: true,
    text: '一个清晨，老学者没有再起来。他的手札整齐地摞在枕边，最后一页写着：\n「灰不是敌人。别硬抗。」',
    choices: [{ text: '安葬他，珍藏手札', effects: { res: { notes: 3, relic_codebook: 1 }, buff: 'scholar_legacy' }, result: '你把半本密码簿也放在了手札上面——那是他一直不离身的东西。' }] },

  /* ===== 第二阶段入口（由奠基工程竣工触发） ===== */
  { id: 'stage2_tech', type: 'manual', title: '蒸汽核心点燃', text: '白灰掺炼的锅炉发出低沉的轰鸣，久违的汽笛撕开荒原的寂静。\n聚落迈入【第二阶段·科技路线（蒸汽时代）】。\n\n（最小演示到此结束，后续内容可按 README 继续增补。）', choices: [{ text: '继续', result: '' }] },
  { id: 'stage2_magic', type: 'manual', title: '烘炉与仪轨激活', text: '附魔铭文逐一亮起，白灰在烘炉里化作温顺的光。\n聚落迈入【第二阶段·魔法路线（中介施法与炼金附魔）】。\n\n（最小演示到此结束，后续内容可按 README 继续增补。）', choices: [{ text: '继续', result: '' }] },
  { id: 'stage2_faith', type: 'manual', title: '圣火升腾', text: '不灭的圣火照亮旷野，灰雪落在信徒肩头，竟不再刺骨。\n聚落迈入【第二阶段·宗教路线（守夜苦修）】。\n\n（最小演示到此结束，后续内容可按 README 继续增补。）', choices: [{ text: '继续', result: '' }] },
]);
