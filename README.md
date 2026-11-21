# 余烬微光 · 引擎与最小演示

纯前端（无构建、无依赖）。双击 `index.html` 即可运行，或 `python -m http.server` 后访问。
URL 参数：`?speed=10` 加速，`?debug` 显示隐式倾向点数。存档在 localStorage。

## 增补内容 = 往 `js/content/*.js` 添条目
所有内容通过 `Game.define('类型', [ ... ])` 注册，引擎无需修改；新文件在 `index.html` 加一行 `<script>` 即可。

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| resources.js | resources | 资源；`group:'relic'` 即前文明遗物（也是资源，可直接用于研究/事件消耗） |
| actions.js | actions | 手动行动：`cost / cooldown / effects / logs / requires` |
| buildings.js | buildings | `cost costMult housing storage slots heat produce consume mods requires max onBuild` |
| jobs.js | jobs | 每名工人每秒 `produce / consume / research` |
| research.js | research | `cost`(立项消耗) `time`(攻关量) `requires effects`；建筑/节点通过 `requires.research` 自动解锁 |
| nodes.js | nodes | 探索节点：`ring travel supply searchCost step loot danger events onExplored` |
| events.js | events | `type: single / milestone / manual`；`choices[].effects.align` 即隐式倾向；`next`/`schedule` 组成事件链 |
| projects.js | projects | 文明奠基工程，最先竣工者锁定路线、进入第二阶段 |
| buffs.js | buffs | 增益/减益：`good duration(省略=永久) stack effects:[{key,pct}\|{key,flat}]`；事件/研究里用 `effects.buff:'id'` 授予 |
| rules.js | `Game.rule` | 粮食、移民、严寒等自定义逻辑 |
| config.js | config / tabs | 全局参数、页签 |

### 条件 `requires`
`has:{res:n}` `seen:[res]` `bld:{id:n}` `research:[id]` `flags:[f]` `notFlags` `explored:[node]` `stage` `route` `pop` `align:{tech:n}` `any:[条件]` `fn(S,G)`。

### 效果 `effects`（`Game.apply`）
`res:{id:n|[min,max]}` `align` `flags` `clearFlags` `pop` `bld` `mods`(如 `{'job:farmer':0.25}`) `stage` `log` `event` `schedule:{event,delay}` `unlockRoutes` `fn(S,G)`。

## 引擎结构
- `engine/core.js` 注册表、状态、条件/消耗/效果、存档
- `engine/systems.js` 生产消耗、人口岗位、研究、事件、探索、奠基工程、主循环
- `engine/ui.js` 渲染（字符串 + DOM 对比更新）与输入

## 演示流程
拾枯木 → 点燃篝火 → 建窝棚 → 绘图桌 → 研究 → 探索荒原 → 事件积累倾向 → 触发「长冬将至」→ 立项奠基工程 → 进入第二阶段。第二阶段仅放置入口事件与每条路线一座示例建筑。

## Buff 与悬浮提示
- Buff 的 `pct` 为百分比、`flat` 为固定数值；`key` 可为 `res:资源`、`job:岗位`、`bld:建筑`、`research`、`travel`、`build`、`pop:eat`、`pop:immigrate`、`pop:housing`、`pop:heat`、`cap:资源`。引擎在 `derive()` 中聚合，生产/研究/人口规则通过 `G.mod(key)`、`G.flat(key)` 读取。
- 条目注释不直接显示，鼠标悬停弹出提示框；资源行悬停显示净产出与各来源（建筑、岗位、buff、以及 `Game.rule` 的 `rates` 声明）。
- 通配键：`job:*`、`res:*`、`bld:*` 作用于该类全部条目。聚落状态（饥饿/寒冷/严寒）也是 buff，由 `rules.js` 的 `status` 规则按条件自动授予/移除，惩罚数值在 `buffs.js` 调整。
