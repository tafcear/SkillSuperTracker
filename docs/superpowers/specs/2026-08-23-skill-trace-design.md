# Skill Trace — 技能轨迹可视化独立本地工具设计文档

> 状态：三轮评审闭环（Kimi 两轮设计/选型 + 终审有条件通过，修订已合入），待用户最终批准 ｜ 日期：2026-08-23

## 一、背景与问题

用户是 DSH（DeepSeek Harness）重度用户，管理 20+ 个 agent skills（带 SKILL.md 的指令目录，AI agent 按任务自动调用）。四个痛点：

1. **看不见**：不知道哪些技能被真实调用过、频率与趋势如何（使用证据缺失）
2. **看不懂**：一个会话/项目完成后，无法回顾「哪个技能怎么被触发、触发后产生了什么产物」的完整链路
3. **不好管**：对某技能不满意想替换、想补空白场景，没有数据支撑的推荐能力
4. **管不动**：删除/冻结等操作散落在文件系统与多个工具之间，无统一交互面

## 二、目标与非目标

### 目标

- 解析 DSH 会话日志，重建「技能触发链 → 工具调用 → 产物」的会话级时序树（MVP 先 DSH；Claude Code 于 P1）
- 提供跨会话技能使用统计（热度 heat：调用频次/最近使用/趋势指标——趋势数值 MVP 可有，趋势时间线可视化 P1）
- 自包含 HTML 交互视图：树状/流程图 + 节点详情 + 右键菜单（选优/替换/删除/更新/冻结，分层点亮）
- 独立本地工具，双击即用；隐私本地化，零遥测

### 非目标（明确不做）

- 不做 DSH 插件（用户已裁定独立工具形态）
- MVP 不做任何写操作/推荐/选优（P1 起分层交付）
- 不做「空白推荐」（无负样本数据，语义不可解；P2 后 LLM 离线人审制）
- 不做产物依赖推断边（时序即结构；依赖边 P3 再评估）
- 不做自研「冻结」机制（必须复用 DSH 生态既有约定，见 §六）

## 三、需求分层（行标签按分期统一；「L0 跨 agent 只读 / L1 DSH 专属写操作」的能力分层见 D1）

| 阶段 | 范围 | 能力 |
|---|---|---|
| **MVP** | DSH（架构多 agent 中立） | 日志解析 → 轨迹 JSON → 单会话时序树（只读）+ 跨会话 heat 统计 |
| **P1** | 检测到 `~/.dsh` 才点亮写操作 | Claude Code adapter；软删除 / 冻结（复用 zebbkira 前言改写约定）/ 更新（语义待定义，暂缓）；趋势时间线 |
| **P2** | — | **安全审计主线**（Blast Radius 权限着色 + 选优 forkprobe 对比实测 + 技能安全体检）；替换推荐（skills.sh 生态 skill_find）；CI 无头回归断言；Time-Travel 单步回放 |
| **P3** | 按需扩展 | 其他 agent adapter（Codex/Gemini/…）、产物依赖边、Trajectory-to-Skill 轨迹提炼 |

## 四、架构决策（含两轮 Kimi 评审裁定）

### D1 形态：独立本地工具（用户裁定）

- 非 DSH 插件；对多 agent 支持采用**分层产品**定位（L0 跨 agent 只读 + L1 DSH 专属写操作），不做「全 agent 写操作」承诺

### D2 数据源策略：DSH 起步 + adapter-first 多 agent 架构（用户修正）

- **MVP 只实现 DSH adapter**（`~/.dsh/sessions/**/session.jsonl.zstd`）
- 但架构 **adapter-first**，从第一天起：
  - 统一轨迹 JSON schema 保持 **agent 中立**（DSH 专属信息放 adapter 扩展字段，不进核心 schema）
  - adapter 接口抽象（输入=日志文件 → 输出=轨迹）即多 agent 契约；Claude Code / Codex / Gemini 等后续仅差一个实现，不动核心
  - 前端/统计层只依赖 agent 中立 schema，不感知数据来自哪个 agent
- **砍掉**「埋点兜底」：等于为每个 agent 各写一个薄 adapter，且各 agent 不会主动写统一格式，成本不比原生解析低
- 其他 agent：Claude Code 先行（P1），其余按真实需求逐个加 adapter
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

- MVP：`npx <pkg> analyze --open`（解析后落自包含 HTML 并直接打开）+ `.bat` 双击启动器封装该命令；**`serve` 归 P1**（配合日志文件监视实时推送）
- 单 exe（`node --sea` / bun compile / deno compile）**P2 观望**——SEA 仍 Active development（Stability 1.1），且 TS 栈在「单 exe」上三者最弱（对照 PyInstaller/Rust 单二进制），不作为选型论据

### D7 存储

- MVP：`stat` 跨会话统计**纯内存聚合**，输出 JSON + 静态 HTML（无数据库）
- P1：增量索引与历史趋势改存 Node 内置 `node:sqlite`（避免 better-sqlite3 原生编译）

### D8 格式漂移对策（项目头号长期风险，Kimi 一轮 I-4 + 二轮裁决）

1. **黄金样本夹具**：真实日志样本（脱敏）固定进仓库，跑解析回归；DSH 升级后先跑夹具再发布（MVP 期以本地脚本跑回归，GitHub 建仓后上 CI）
2. **宽松解析**：按字段名宽松提取、未知字段忽略、单行解析失败跳过并计数（一行坏数据不毁整个视图）
3. **格式指纹探测**：解析前嗅探版本特征，未知版本明确降级提示而非静默出错
4. **读取并发容忍**：DSH 写入中的日志尾部不完整行/帧属正常路径
5. **schema 版本化契约**：zod schema + `toJSONSchema()` 产物入库，轨迹格式变更即契约变更

## 五、组件设计

```
skillsupertracker/                # npm workspaces monorepo
├── packages/
│   ├── core/                 # 轨迹 schema（zod，agent 中立）+ 类型 + 帧扫描 vendored 层
│   │   └── zstd-frames.ts    # vendor 自 DSH scanZstdFrames（含 license 声明）
│   ├── adapters/
│   │   ├── types.ts          # adapter 接口契约（多 agent 抽象，MVP 定稿）
│   │   ├── dsh/              # DSH session.jsonl.zstd → 轨迹（MVP 唯一实现）
│   │   └── claude/           # P1（接口已定稿，仅差实现）
│   ├── cli/                  # analyze / stat（MVP）；serve（P1，日志监视实时推送）
│   └── web/                  # 自包含 HTML（Cytoscape 树 + heat 表 + 右键菜单）
└── fixtures/                 # 黄金样本（脱敏真实日志）
```

- **CLI**：`skillsupertracker analyze <session-id|dir> --open`（MVP：单会话轨迹 → 自包含 HTML 并打开）、`skillsupertracker stat`（MVP：跨会话 heat）、`skillsupertracker serve`（P1：本地 HTTP + 文件监视实时推送）
- **轨迹 schema**（zod 定义，JSON Schema 导出）：`session / turns[] / events[]`，事件类型：`skill-load`（skill 名称、来源根、选择理由字段若可提取）/ `tool-call`（工具名、目标）/ `artifact`（产物：写入的文件路径、commit 等）/ 元数据（耗时、token 若有）
- **前端**：左=时序树（节点=会话→turn→skill→工具→产物，颜色=heat），右=节点详情面板；右键菜单按 L0/L1 分层点亮；顶部=跨会话 heat 统计视图
- **动作执行器（P1 起）**：软删除（quarantine + manifest 记录原路径/时间戳，30 天宽限）、冻结（复用 zebbkira 前言改写约定，逐字节兼容）

## 六、安全与边界（Kimi 一轮 C-1）

- 冻结/禁用**不自研机制**：必须复用 zebbkira/dsh-skills-mcp-manager 的前言改写约定（SKILL.md frontmatter `disable-model-invocation`/`user-invocable`），与 DSH 运行时行为一致，杜绝「两工具各执一份真相」
- 删除一律**软删除**：移到 `quarantine/` + manifest 记录，禁止物理删除
- 所有写操作：dry-run 预览 diff → 用户确认 → 落盘前自动备份原文件
- 作用域白名单：默认只动**用户级**技能目录 `~/.dsh/skills` 与 `~/.agents/skills`（zebbkira manager 实际管辖的两根，冻结复用其前言改写约定）；**项目级** `.dsh/skills`、`.agents/skills` 需逐个显式授权；Claude 侧冻结在 P3 前须先论证其运行时是否承认前言约定，此前不承诺
- 「更新」语义模糊（从哪里拉新版？是否覆盖本地改动？）——定义清楚前不进菜单

## 七、测试策略

- 黄金样本回归：脱敏真实 session.jsonl.zstd 入 fixtures（P1 起含 Claude .jsonl），MVP 期本地脚本跑解析一致性、GitHub 建仓后上 CI
- 帧扫描单测：合成多帧流（≥2 帧 + 撕裂帧变体），断言逐帧输出完整、tornStart 恢复正确
- 宽松解析单测：坏行/未知字段/截断尾行不炸、计数上报
- 前端：右键菜单状态机（L0/L1 分层点亮）单测；Cytoscape 渲染冒烟

## 八、分期计划

| 阶段 | 内容 | 明确不做 |
|---|---|---|
| **MVP（约 2 周）** | 轨迹 schema（agent 中立）+ adapter 接口契约；**DSH adapter**（唯一实现）；`analyze --open`/`stat` CLI；单会话时序树（只读，节点含产物）；heat 统计；`.bat` 启动器（调 analyze 并打开 HTML） | 一切写操作、推荐、选优、依赖边、其他 agent adapter、serve |
| **P1** | **Claude Code adapter**（接口已随 MVP 定稿）；`serve`（日志监视实时推送）；趋势时间线；软删除 + 冻结（复用 zebbkira 约定）；`node:sqlite` 增量索引 | 空白推荐 |
| **P2** | **安全审计主线**：Blast Radius（按读写权限对节点着色：只读 / 工作区修改 / 高危网络与系统操作，凭据泄露提示）+ 技能安全体检 + 选优（forkprobe，DSH only）；替换推荐（skills.sh skill_find 对接）；**CI 无头回归断言**（CI 校验 Agent 运行是否触发异常技能调用路径）；Time-Travel 单步回放；单 exe 观望评估 | — |
| **P3** | 其他 agent adapter（Codex/Gemini/… 按真实需求）；产物依赖边；**Trajectory-to-Skill 轨迹提炼**（成功轨迹一键提炼为标准 skill 声明） | — |

## 九、风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| DSH 日志格式漂移 | 高 | D8 五件套（夹具/宽松/指纹/并发容忍/schema 契约） |
| 多帧 zstd 静默截断 | 高（已识别） | D4 vendored 帧扫描 + 逐帧解码 + 单测 |
| 与已装 manager 插件状态分裂 | 高 | §六：冻结复用其约定、删除软删除 |
| Node zstd API experimental 变动 | 中 | 逐帧 one-shot（`zstdDecompressSync`），禁整文件 one-shot 与流式 + engines 锁 >=22.15 |
| 单 exe 分发不成熟 | 中 | MVP npx+.bat；SEA/bun P2 观望 |
| 多 agent 扩展把 DSH 假设带进核心 | 中 | adapter-first：schema agent 中立 + 扩展字段 + 前端只依赖中立 schema |

## 十、已定项与待定项

### 已定（2026-08-23 用户裁定）

1. **项目命名**：**统一命名 `skillsupertracker`**——GitHub 仓库（tafcear/skillsupertracker，自 skill-tracker 改名而来）与 npm 发布名一致（npm 上 `skill-tracker` 已被占用 1.0.1，故统一用此名）
2. **GitHub 远端**：已建 **public 开源仓库**（tafcear/skillsupertracker，2026-08-23）；**License 待定**（用户将与作者讨论，定案前仓库不设 LICENSE 文件、README 标注「License 待定」）
3. **黄金样本**：用户已授权从本机 `~/.dsh/sessions` 取 1-2 个会话日志入库，**要求严格脱敏**（去消息正文/密钥/本地绝对路径/会话 ID，仅保留事件结构与调用序列）

### 待定项（不阻塞 MVP）

- 无（三项均已在上面定案；License 选择随项目推进讨论）
