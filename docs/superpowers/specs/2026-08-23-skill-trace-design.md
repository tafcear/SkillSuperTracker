# Skill Trace — 技能轨迹可视化独立本地工具设计文档

> 状态：待用户审阅 ｜ 日期：2026-08-23 ｜ 评审历史：Kimi 两轮（2026-08-23，结论均已合入）

## 一、背景与问题

用户是 DSH（DeepSeek Harness）重度用户，管理 20+ 个 agent skills（带 SKILL.md 的指令目录，AI agent 按任务自动调用）。四个痛点：

1. **看不见**：不知道哪些技能被真实调用过、频率与趋势如何（使用证据缺失）
2. **看不懂**：一个会话/项目完成后，无法回顾「哪个技能怎么被触发、触发后产生了什么产物」的完整链路
3. **不好管**：对某技能不满意想替换、想补空白场景，没有数据支撑的推荐能力
4. **管不动**：删除/冻结等操作散落在文件系统与多个工具之间，无统一交互面

## 二、目标与非目标

### 目标

- 解析 DSH 与 Claude Code 会话日志，重建「技能触发链 → 工具调用 → 产物」的会话级时序树
- 提供跨会话技能使用统计（热度 heat：调用频次/最近使用/趋势）
- 自包含 HTML 交互视图：树状/流程图 + 节点详情 + 右键菜单（选优/替换/删除/更新/冻结，分层点亮）
- 独立本地工具，双击即用；隐私本地化，零遥测

### 非目标（明确不做）

- 不做 DSH 插件（用户已裁定独立工具形态）
- MVP 不做任何写操作/推荐/选优（P1 起分层交付）
- 不做「空白推荐」（无负样本数据，语义不可解；P2 后 LLM 离线人审制）
- 不做产物依赖推断边（时序即结构；依赖边 P3 再评估）
- 不做自研「冻结」机制（必须复用 DSH 生态既有约定，见 §六）

## 三、需求分层

| 层 | 范围 | 能力 |
|---|---|---|
| **L0 跨 agent（MVP）** | 所有支持 agent | 日志解析 → 轨迹 JSON → 单会话时序树（只读）+ 跨会话 heat 统计 |
| **L1 DSH 专属（P1）** | 检测到 `~/.dsh` 才点亮 | 软删除 / 冻结（复用 zebbkira 前言改写约定）/ 更新（语义待定义，暂缓） |
| **P2** | — | 替换推荐（skills.sh 生态 skill_find）、选优（forkprobe 对比实测，DSH only）、趋势时间线 |
| **P3** | 按需扩展 | 其他 agent adapter（Codex/Gemini/…）、产物依赖边 |

## 四、架构决策（含两轮 Kimi 评审裁定）

### D1 形态：独立本地工具（用户裁定）

- 非 DSH 插件；对多 agent 支持采用**分层产品**定位（L0 跨 agent 只读 + L1 DSH 专属写操作），不做「全 agent 写操作」承诺

### D2 数据源策略：混合（用户选路线 3，Kimi 二轮修正）

- **MVP 原生 adapter 两个**：DSH（`~/.dsh/sessions/**/session.jsonl.zstd`）+ Claude Code（`~/.claude/projects/**/*.jsonl`）
- 统一轨迹 JSON schema 公开文档化，作为 adapter 输出契约
- **砍掉**「埋点兜底」：≈N 个 adapter 换名，且各 agent 不会主动写统一格式
- 其他 agent（Codex/Gemini/Reasonix…）P3 按真实需求逐个加 adapter
- 格式漂移跟踪：DSH 开源在 GitHub，可跟上游 diff（优于逆向私有格式）

### D3 技术栈：TypeScript/Node 全栈（两轮 Kimi 审查裁决「成立，理由重写」）

成立的三条硬论据：
1. 前端强制 JS + 解析器体量小（各 adapter 200–400 行）→ 单语言省一条 codegen 流水线
2. DSH 官方提供可直接 vendored 的 **zstd 帧扫描正确性层**（见 D4）
3. Node ≥22.15 内置 zstd，**零原生依赖**；对照 Python 的 zstandard 是 C 扩展，Windows 分发反而多编译/轮子成本

修正后的依赖骨架：

```jsonc
{
  "engines": { "node": ">=22.15" },   // zstd 回 port 下限（v23.8.0 引入，v22.15.0 回 port）
  "dependencies": {
    "zod": "^4"                        // 轨迹 schema 单一事实源 + toJSONSchema() 导出漂移契约
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "*", "vite-plugin-singlefile": "*",  // 自包含 HTML 产物
    "cytoscape": "^3.34", "cytoscape-elk": "*",  // 交互图 + DAG 分层布局
    "vitest": "*"                      // 黄金样本测试：真实日志 fixtures
  }
}
```

### D4 zstd 解码层（Kimi 二轮 C1，正确性底线）

- **Node 官方 zstd API 对拼接多帧流会静默只解第一帧**（本机实测：one-shot 与流式均不报错丢弃后续帧）
- 必须 vendor DSH 官方 `scanZstdFrames`（帧头结构扫描：magic → frame header → block 链 → checksum，含撕裂帧 torn-frame 恢复）+ 逐帧 `zstdDecompressSync`
- **禁止**对整个文件直接 one-shot 解码；**不抄** DSH 私有 handle 解码器（性能优化，本项目数据量级用 public 路径即可）
- 对 DSH 正在写入的日志：尾部撕裂帧属正常路径，按 tornStart 处理

### D5 图引擎（Kimi 二轮 I3）

- **Cytoscape.js 核心**（3.34 活跃维护）+ **cytoscape-elk** 布局（时序树是 DAG，elk 分层效果优于 dagre）
- 右键菜单：**不依赖 cxtmenu**（停更 3.5 年）；用 `cxttap` 事件 + 自绘 HTML 菜单（绝对定位 div，约 100 行），菜单项按节点状态动态生成——适配「选优/替换/删除/更新/冻结」分层点亮需求
- archify SVG 模板定位为**静态导出/报告**形态，不承载交互操作

### D6 分发（Kimi 二轮 I2 修正）

- MVP：`npx <pkg>` + `.bat` 双击启动器（`@echo off; npx skill-trace serve`）
- 单 exe（`node --sea` / bun compile / deno compile）**P2 观望**——SEA 仍 Active development（Stability 1.1），且 TS 栈在「单 exe」上三者最弱（对照 PyInstaller/Rust 单二进制），不作为选型论据

### D7 存储

- MVP：`stat` 跨会话统计**纯内存聚合**，输出 JSON + 静态 HTML（无数据库）
- P1：增量索引与历史趋势改存 Node 内置 `node:sqlite`（避免 better-sqlite3 原生编译）

### D8 格式漂移对策（项目头号长期风险，Kimi 一轮 I-4 + 二轮裁决）

1. **黄金样本夹具**：真实日志样本（脱敏）固定进仓库，CI 跑解析回归；DSH 升级后先跑夹具再发布
2. **宽松解析**：按字段名宽松提取、未知字段忽略、单行解析失败跳过并计数（一行坏数据不毁整个视图）
3. **格式指纹探测**：解析前嗅探版本特征，未知版本明确降级提示而非静默出错
4. **读取并发容忍**：DSH 写入中的日志尾部不完整行/帧属正常路径
5. **schema 版本化契约**：zod schema + `toJSONSchema()` 产物入库，轨迹格式变更即契约变更

## 五、组件设计

```
skill-trace/
├── packages/
│   ├── core/                 # 轨迹 schema（zod）+ 类型 + 帧扫描 vendored 层
│   │   └── zstd-frames.ts    # vendor 自 DSH scanZstdFrames（含 license 声明）
│   ├── adapters/
│   │   ├── dsh/              # DSH session.jsonl.zstd → 轨迹
│   │   └── claude/           # Claude projects/*.jsonl → 轨迹
│   ├── cli/                  # analyze / stat / serve 子命令
│   └── web/                  # 自包含 HTML（Cytoscape 树 + heat 表 + 右键菜单）
└── fixtures/                 # 黄金样本（脱敏真实日志）
```

- **CLI**：`skill-trace analyze <session-id|dir>`（单会话轨迹）、`skill-trace stat`（跨会话 heat）、`skill-trace serve`（本地 HTTP + 打开浏览器）
- **轨迹 schema**（zod 定义，JSON Schema 导出）：`session / turns[] / events[]`，事件类型：`skill-load`（skill 名称、来源根、选择理由字段若可提取）/ `tool-call`（工具名、目标）/ `artifact`（产物：写入的文件路径、commit 等）/ 元数据（耗时、token 若有）
- **前端**：左=时序树（节点=会话→turn→skill→工具→产物，颜色=heat），右=节点详情面板；右键菜单按 L0/L1 分层点亮；顶部=跨会话 heat 统计视图
- **动作执行器（P1 起）**：软删除（quarantine + manifest 记录原路径/时间戳，30 天宽限）、冻结（复用 zebbkira 前言改写约定，逐字节兼容）

## 六、安全与边界（Kimi 一轮 C-1）

- 冻结/禁用**不自研机制**：必须复用 zebbkira/dsh-skills-mcp-manager 的前言改写约定（SKILL.md frontmatter `disable-model-invocation`/`user-invocable`），与 DSH 运行时行为一致，杜绝「两工具各执一份真相」
- 删除一律**软删除**：移到 `quarantine/` + manifest 记录，禁止物理删除
- 所有写操作：dry-run 预览 diff → 用户确认 → 落盘前自动备份原文件
- 作用域白名单：默认只动用户级技能目录（`~/.dsh/skills`、`~/.claude/…`），项目级目录需逐个显式授权
- 「更新」语义模糊（从哪里拉新版？是否覆盖本地改动？）——定义清楚前不进菜单

## 七、测试策略

- 黄金样本回归：脱敏真实 session.jsonl.zstd / .jsonl 入 fixtures，CI 跑 adapter 解析一致性
- 帧扫描单测：合成多帧流（≥2 帧 + 撕裂帧变体），断言逐帧输出完整、tornStart 恢复正确
- 宽松解析单测：坏行/未知字段/截断尾行不炸、计数上报
- 前端：右键菜单状态机（L0/L1 分层点亮）单测；Cytoscape 渲染冒烟

## 八、分期计划

| 阶段 | 内容 | 明确不做 |
|---|---|---|
| **MVP（约 2 周）** | 轨迹 schema；DSH + Claude adapter；`analyze`/`stat` CLI；单会话时序树（只读，节点含产物）；heat 统计；`.bat` 启动器 | 一切写操作、推荐、选优、依赖边、其他 agent |
| **P1** | 趋势时间线；软删除 + 冻结（复用 zebbkira 约定）；`node:sqlite` 增量索引；日志文件监视（实时追加） | 空白推荐 |
| **P2** | 替换推荐（skills.sh skill_find 对接）；选优（forkprobe，DSH only）；单 exe 观望评估 | — |
| **P3** | 其他 agent adapter（按真实需求）；产物依赖边 | — |

## 九、风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| DSH/Claude 日志格式漂移 | 高 | D8 五件套（夹具/宽松/指纹/并发容忍/schema 契约） |
| 多帧 zstd 静默截断 | 高（已识别） | D4 vendored 帧扫描 + 逐帧解码 + 单测 |
| 与已装 manager 插件状态分裂 | 高 | §六：冻结复用其约定、删除软删除 |
| Node zstd API experimental 变动 | 中 | 只用 one-shot API + engines 锁 >=22.15 |
| 单 exe 分发不成熟 | 中 | MVP npx+.bat；SEA/bun P2 观望 |

## 十、待定项（需用户裁定）

1. **项目命名**：skill-trace / skill-trail / 其他？（npm scope 一并定）
2. 仓库位置：`E:\BaiduSyncdisk\Data\vibe-coding\skill-trace\`（与 kimi-tide 等并列）是否 OK；GitHub 仓库建不建、public/private
3. 黄金样本来源：用户授权从本机 `~/.dsh/sessions` 取 1-2 个会话日志脱敏入库
