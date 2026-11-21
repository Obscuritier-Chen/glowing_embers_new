# 「余烬微光」—— AI 叙事导演系统（AI Storyteller & Director）架构设计

## 一、 核心设计理念：“确定性模拟底座 + AI 涌现式叙事导演”

在传统纯文字经营游戏中，事件往往来自固定的 JSON 事件库，玩第二遍就会失去新鲜感；而如果完全让 AI 自由跑团（纯 LLM 文字冒险），又容易失去资源管理与数值经营的严谨策略感。

本设计采用**“双核解耦、接口通信”**架构：
- **游戏引擎层（确定性状态机）**：负责每秒 Tick 的资源产出消耗、建筑建造、人口分配、研究读条与节点行军计算。它保证游戏的**基本规则、算术逻辑与生存压力绝对严谨**。
- **AI 导演层（LLM Agent）**：不参与每秒的基础算术，而是作为幕后的**“叙事导演（Director）”**。它通过读取游戏引擎暴露的**格式化状态与故事线接口**，在后台维护一套**隐式世界与人性数值**，实时编织单次事件、动态衍生事件链、并根据玩家的所作所为决定文明分叉与剧情走向。

```
┌─────────────────────────────────────────────────────────────┐
│                    游戏核心引擎 (Game Engine)                │
│  [聚落资源/建筑/人口]   [研究进度]   [荒原探索节点]   [UI]    │
└──────────────┬──────────────────────────────────▲───────────┘
               │ 1. 导出格式化状态与故事线          │ 4. 调用事件生成接口
               │    GET /api/game/context         │    POST /api/game/inject_event
               ▼                                  │    (含叙事文本、选项、数值Effect)
┌─────────────────────────────────────────────────┴───────────┐
│                  AI 叙事导演 (AI Storyteller)               │
│  • 维护多层叙事记忆 (Storyline Memory: 摘要 + 活跃事件链)     │
│  • 维护后台隐式数值 (Hidden Axes: 三路线倾向/人性/异化/压力)  │
│  • 节奏控制器 (Pacing Controller: 顺境施压 / 绝境留一线生机)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、 游戏向 AI 暴露的上下文接口（Context Export Protocol）

当满足触发时机（如：固定天数周期、特定建筑竣工、探索队抵达节点、玩家刚做出上一步事件选择、或聚落发生饥荒/严寒危机）时，游戏引擎将当前状态打包为结构化的 JSON 提供给 AI。

### 2.1 状态与故事线导出 Schema（`GameContextPayload`）

为了兼顾 Token 效率与叙事连贯性，导出的数据分为**四大模块**：

```json
{
  "world_meta": {
    "day": 42,
    "season": "深秋（长冬前夕）",
    "stage": 1,
    "stage_name": "基本生存阶段：中世纪末期农业聚落",
    "chosen_route": null,
    "environment": {
      "temperature": -8,
      "weather": "中度白灰沉降",
      "ash_erosion_level": 0.35
    }
  },
  "settlement_snapshot": {
    "population": {
      "total": 28,
      "idle": 2,
      "sick_or_injured": 3,
      "starving": 0,
      "jobs": { "farmer": 8, "miller": 2, "blacksmith": 4, "scholar": 3, "guard": 4, "explorer": 5 }
    },
    "resources_status": {
      "food_days_remaining": 14.5,
      "fuel_days_remaining": 4.2,
      "key_stockpiles": { "wood": 320, "stone": 180, "refined_iron": 45, "pale_ash": 60, "research_notes": 85 },
      "bottlenecks": ["燃料储备告急", "铁器受白灰风化磨损加快"]
    },
    "landmarks_built": ["三圃轮作农田", "风车磨坊", "高炉铁匠铺", "市政学者厅"],
    "recent_researches": ["水利与风力传动", "浅层地质勘探"],
    "relics_owned": ["生锈的瓦特离心调速器", "旧世炼金学徒的铅封笔记"]
  },
  "exploration_state": {
    "active_team_location": "废弃铁道扳道房",
    "node_progress": 0.65,
    "recent_discovery": "在扳道房地下室发现了一名高烧昏迷的旧世钟表匠后裔"
  },
  "storyline_memory": {
    "macro_summary": "聚落从最初的3人篝火起步，历经第一场寒潮后开垦了黑麦农田并建起风车磨坊。在处理此前矿工灰咳病时，玩家倾向于使用炼金草药与蒸馏术；近期因燃料紧张，聚落内出现小规模争执。",
    "active_event_chains": [
      {
        "chain_id": "chain_clockmaker_01",
        "title": "「扳道房的昏迷者」",
        "current_step": 1,
        "context": "探索队将昏迷的钟表匠后裔带回聚落，他怀里死死抱着一只倒着走的黄铜怀表。",
        "last_player_choice": "消耗草药与白灰触媒为他调制退烧灵药，并派学者守在床边记录他的胡话"
      }
    ],
    "recent_event_history": [
      { "day": 38, "event": "「风车轴的异常锈蚀」", "choice": "尝试涂抹白灰与油脂混合物进行附魔封存" }
    ]
  },
  "hidden_axes": {
    "alignment_tech": 14,
    "alignment_magic": 26,
    "alignment_religion": 9,
    "settlement_cohesion": 62,
    "pragmatism_vs_empathy": 40,
    "ash_assimilation_depth": 18,
    "narrative_tension": 45
  }
}
```

---

## 三、 AI 在幕后维护的隐式数值体系（Hidden Axes System）

AI 不仅是事件生成器，还是隐式状态机的维护者。除了显式的资源（木材、粮食、铁），AI 在后台维护 **3 组核心隐式维度**，每次玩家做出抉择或聚落发生状态变化时，AI 都会动态调整这些数值，并以此决定后续刷出什么性质的事件：

### 3.1 第一组：文明路线倾向轴（决定第一阶段末的分叉与叙事口吻）
1. **`alignment_tech`（匠作与实证倾向，0~100）**
   - 玩家越常采用工程、冶炼、解剖、物理改造的方式处理问题则上升。
   - **对事件的影响**：当此值较高时，AI 会倾向于生成工匠灵感、机械故障改良、矿脉勘探、旧世工程图纸相关的事件。
2. **`alignment_magic`（触媒与秘仪倾向，0~100）**
   - 玩家越常采用白灰炼金、器物附魔、仪式、神秘学解析的方式处理问题则上升。
   - **对事件的影响**：AI 会更多生成奇异植物变异、炼金实验意外、附魔共鸣、学徒冥想异象等事件。
3. **`alignment_religion`（虔信与守望倾向，0~100）**
   - 玩家越常采用祈祷、受灰礼、苦修共担、精神感召的方式处理问题则上升。
   - **对事件的影响**：AI 会更多生成流民朝圣、守夜歌谣、白灰精神温顺化、信徒神迹体验等事件。

### 3.2 第二组：聚落社会与人性暗线轴（决定事件风格与突发危机）
4. **`pragmatism_vs_empathy`（冷酷功利 vs 温情守望，-100 ~ +100）**
   - 记录玩家在绝境中的道德取向（如：是否抛弃重病流民、是否强迫工人超负荷加班、是否分粮给外来求援者）。
   - **对事件的影响**：偏向冷酷功利时，生产效率高但易触发“深夜哗变、工坊纵火、流民畏惧逃离”事件；偏向温情守望时，口粮消耗大但易触发“绝境义举、外邦流民带宝投奔、患难互助”事件。
5. **`ash_assimilation_depth`（白灰同化深度，0~100）**
   - 对应世界观底层的“同类相融”法则。衡量聚落对白灰的接纳与融合程度。
   - **对事件的影响**：过低时，频发“铁器崩碎、石墙风化”事件；稳步提升时，触发突破性的抗蚀技术/附魔/圣咏领悟事件；若短时间内激增过快，则会触发极具张力的“白灰异象/概念同化副作用”事件链。

### 3.3 第三组：AI 导演节奏控制轴（Pacing & Drama）
6. **`narrative_tension`（戏剧张力/压力值，0~100）**
   - AI 根据当前聚落生存状况（口粮余量、伤病率、温度）与近期事件烈度自动调节：
   - **顺境施压**：当聚落衣食无忧、`tension` 过低时，AI 导演会主动拉高张力，编排一场突如其来的危机事件链（如暗河改道、灰暴提前、神秘来客带来棘手难题）。
   - **绝境留一线（喘息机制）**：当聚落饥寒交迫、濒临崩溃且 `tension` 极高时，AI 导演不会再雪上加霜刷出纯惩罚事件，而是刷出**“带代价的生机事件”**（如发现一处被白灰半掩的旧世军粮窖，但需要付出某种倾向抉择或长期承诺）。

---

## 四、 游戏向 AI 暴露的事件注入与控制接口（Event Injection API）

AI 根据上述 Context 推理后，通过调用游戏提供的 **结构化工具接口（Function Calling / JSON Schema）** 将生成的事件、后续分支判定以及隐式数值修改注入回游戏中。

### 4.1 事件注入接口 Schema（`inject_event`）

为了确保 AI 生成的事件能**100%安全、准确地操作游戏内的真实资源与建筑**，接口将“自由叙事文本”与“受限指令集（DSL Effect）”严格分离：

```json
{
  "event_id": "evt_chain_clockmaker_02",
  "event_type": "chain_step",
  "chain_id": "chain_clockmaker_01",
  "title": "「逆行的黄铜怀表」",
  "narrative_text": "窗外的白灰在风车叶片上沙沙作响。昏迷三日的钟表匠后裔终于在苦艾与白灰蒸馏液的刺激下睁开了眼睛。他枯瘦的手指指向桌上那只逆时针跳动的黄铜怀表，声音沙哑：『别让它停下……表壳里封着旧世皇家天文台调配的灰铅油，只要顺着它的发条规律改动铁匠铺的风箱，风化就追不上我们的铁器……但一旦拆开它，它就再也走不动了。』",
  "options": [
    {
      "option_id": "opt_disassemble",
      "label": "「拆解怀表，测绘内部齿轮并化验灰铅油成分」",
      "hint_text": "获得宝贵的抗蚀冶金笔记，但怀表将永久损毁",
      "requirements": {
        "min_job": { "scholar": 1 }
      },
      "resource_deltas": {
        "research_notes": 40,
        "refined_iron": -5
      },
      "hidden_axis_deltas": {
        "alignment_tech": 5,
        "pragmatism_vs_empathy": -3,
        "ash_assimilation_depth": 4
      },
      "follow_up_directive": {
        "chain_action": "advance",
        "next_step_trigger": "after_days:3",
        "story_note": "玩家选择强行拆解怀表逆向研究，钟表匠感到惋惜但提供了齿轮图纸。"
      }
    },
    {
      "option_id": "opt_enchant_preserve",
      "label": "「不拆开表壳，以白灰触媒在表盘外铭刻共鸣仪式阵」",
      "hint_text": "消耗白灰与水晶保留怀表，尝试感悟其内部的抗蚀律动",
      "requirements": {
        "resources": { "pale_ash": 20 }
      },
      "resource_deltas": {
        "pale_ash": -20,
        "research_notes": 25
      },
      "hidden_axis_deltas": {
        "alignment_magic": 5,
        "ash_assimilation_depth": 6
      },
      "follow_up_directive": {
        "chain_action": "advance",
        "next_step_trigger": "on_research_complete:any",
        "story_note": "怀表在白灰法阵中发出了微弱的嗡鸣，成为一件稳定的施法媒介。"
      }
    },
    {
      "option_id": "opt_vigil_keep",
      "label": "「将怀表奉于守夜火盆旁，让老匠人安心休养并讲述过往」",
      "hint_text": "安抚人心，钟表匠康复后将作为熟练工匠加入聚落",
      "requirements": {
        "resources": { "cooked_food": 15 }
      },
      "resource_deltas": {
        "cooked_food": -15,
        "population_total": 1
      },
      "hidden_axis_deltas": {
        "alignment_religion": 4,
        "pragmatism_vs_empathy": 5,
        "settlement_cohesion": 6
      },
      "follow_up_directive": {
        "chain_action": "complete_with_relic",
        "grant_relic_name": "「守夜人的逆行怀表」",
        "story_note": "钟表匠感念聚落的仁慈正式定居，并将怀表赠予祠堂。"
      }
    }
  ],
  "director_internal_thought": "当前聚落燃料偏紧且铁器磨损严重，玩家此前魔法倾向(26)略高于科技(14)。通过钟表匠事件链第二步，同时提供拆解实证(科技)、触媒共鸣(魔法)与仁慈收留(宗教/人口)三个方向，并根据玩家选择更新隐式倾向与事件链状态。"
}
```

---

## 五、 AI 掌控游戏进程与转折的核心机制

除了生成日常事件与支线事件链，AI 还通过**里程碑仲裁接口（Milestone Arbitration API）**直接掌控游戏的大阶段推进与剧情走向：

### 5.1 动态生成专属「文明奠基工程」（第一阶段 → 第二阶段）
- 当聚落达到中世纪末期农业镇规模后，游戏请求 AI 触发阶段转折点。
- AI 读取玩家在第一阶段完整的 `storyline_memory` 与 `hidden_axes`：
  - 不仅根据 `[科技 / 魔法 / 宗教]` 隐式点数决定向玩家开放哪几个奠基工程；
  - **还会将玩家在第一阶段经历过的独特故事写进奠基工程的叙事文本与特殊加成中**！（例如：如果玩家在第一阶段救活了老钟表匠并拆解了怀表，那么科技线的【一号蒸汽鼓风中枢】在 AI 生成的描述中就会提到*“采用了老钟表匠改良的逆行擒纵调速阀，蒸汽耗煤量额外降低 10%”*）。

### 5.2 动态生成探索节点奇遇与「前文明遗物」
- 探索地图的拓扑骨架（距离、基础危险度）由引擎固定，但当探索队踏入某个废墟节点时，**节点内发生的具体遭遇、发现的「前文明遗物」名称、背景考据文本与解析效果**，全部由 AI 结合当前主线进度实时生成。
- AI 会在后台维护一份**「真相拼图进度表」**，确保玩家无论走哪条路线、探索哪些节点，都能通过 6~8 件前后呼应的遗物，层层递进地揭开旧世界“地脉深井与白灰同化”的真相。

---

## 六、 工程落地的安全护栏与性能优化（Guardrails & Engineering）

为了让这套 AI 驱动架构在实际网页端稳定、流畅、不崩坏地运行，设计以下四层工程保障：

1. **数值边界钳制器（Value Clamping Sandbox）**：
   - AI 不能随意给玩家 `+99999` 铁矿或瞬间扣光所有人口。
   - 游戏引擎会根据当前阶段（Stage 1/2/3）与事件等级（普通/事件链/里程碑），向 AI 传入允许的**数值变动上下限区间（如单次普通事件资源增减不超过当前储量的 ±25%，人口变动限于 -2 ~ +2）**，并在引擎接收 JSON 时做二次硬性 Clamp 校验。
2. **异步预生成缓冲池（Async Pre-fetching Queue）**：
   - LLM 接口调用通常需要 2~5 秒延迟。若等事件触发瞬间再去请求 AI，玩家会感觉到卡顿。
   - **解决方案**：游戏在后台维护一个容量为 1~2 的**“待触发事件预热池”**。当聚落状态平稳运行在 Tick T 时，后台异步调用 AI 预生成下一个即将到来的事件；当玩家点击选项后，立即异步触发下一步剧情的生成与故事线摘要压缩。
3. **分层滚动记忆压缩（Hierarchical Storyline Compression）**：
   - 随着游戏进行到上百天，不可能把所有历史事件原文全塞进 Prompt。
   - 引擎采用**三层记忆结构**：
     - `L1 世界观与当前阶段宪章`（常驻 System Prompt）
     - `L2 历代大事记滚动摘要（Macro Summary）`（每 15 游戏日由 AI 自动浓缩更新一次，控制在 500 字以内）
     - `L3 活跃事件链状态 + 最近 5 次事件完整记录`（短期精确上下文）
4. **离线/降级兜底机制（Fallback Pool）**：
   - 当网络波动或 AI 接口超时时，引擎自动无缝切换至本地预置的高质量静态事件池，待网络恢复后再将期间的抉择同步给 AI 导演。
