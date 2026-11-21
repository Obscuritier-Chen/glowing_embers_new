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

## AI 导演接口（`js/engine/ai.js`，参考 AI_DIRECTOR_DESIGN.md）
游戏保持纯前端，文档中的 HTTP 接口实现为浏览器内 JS API（`window.GameAI`）：
- `GameAI.getContext()` 导出 `GameContextPayload`（世界、聚落、探索、故事线记忆、隐式轴）；`GameAI.getCatalog()` 导出合法资源/岗位/建筑 id 与数值上限。
- `GameAI.handleToolCall(name, input)` 统一工具入口：`inject_event`、`update_memory`、`adjust_axes`、`set_project_flavor`（JSON Schema 见 `GameAI.tools`）。
- 注入的事件会被校验并二次钳制（资源按容量比例、人口 ±N、隐式轴 ±N、buff 幅度/时长），翻译成引擎事件（受限 DSL，文本与数值分离，文本已转义）；进入待触发池，空闲时弹出。事件链、记忆压缩、遗物、奠基工程叙事、探索奇遇都有对应触发时机。
- 接入方式：① 页头「导演」面板配置 OpenAI 兼容 / Anthropic 接口（浏览器直连，密钥仅存本机）；② `GameAI.setProvider(async req => toolCalls)` 自带适配器；③ 面板开启 postMessage 桥，外部页面发送 `{type:'glowing_embers:get_context'}` / `{type:'glowing_embers:tool_call', name, input}`。
- AI 未启用、失败 3 次或长时间无响应时，静态事件池自动接管。
- 隐式轴存于 `S.axes` 与 `S.align`；`dyn` 存档段保存 AI 生成的事件、buff、遗物。

## 自动模拟脚本（`tools/sim_to_winter.js`）
无界面、不改游戏代码：用 Node 加载 `index.html` 列出的脚本，自动玩家打到「长冬将至」，真实调用 AI 并记录它注入的全部内容。
```
OPENROUTER_API_KEY=sk-... node tools/sim_to_winter.js --model <模型id>
node tools/sim_to_winter.js --mock        # 不联网的假 AI，零成本验证流程
```
参数 `--seed --bias tech|magic|faith|random --max-days --max-real --period-days --save-context --out`。输出到 `tools/out/`（已忽略）：`ai_calls.jsonl`（AI 原始工具调用）、`ai_events.md`（可读转译）、`run.json`（选择、轴变化、token 与费用）。AI 请求在途时游戏时间暂停，保证每次请求都有对应事件被记录。

### AI 导演：请求频率与两段式选项（后续改进）
- 请求频率：待触发池目标为 1 条（池里已有事件就不再预取），非强制请求之间至少间隔 60 游戏秒，事件投放间隔 90 游戏秒；危机、探索抵达、事件链到期、记忆压缩、工程开放仍为强制请求。
- `inject_event` 改为两段式：先写 `options`（由情境、现状与玩家历史自然产生，不必覆盖三个方向），再填 `assessment`（逐选项判断实际体现的隐式倾向，先写 rationale 再给数值）。旧的逐选项 `hidden_axis_deltas` 仍兼容。
- 倾向偏置：上下文新增 `tendency_profile`（三路线占比、近期选择轴向、引擎按占比加权抽签的 `suggested_theme`，含 `challenge` 反噬题材），系统提示要求事件题材贴合建议题材。
