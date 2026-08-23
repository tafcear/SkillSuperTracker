# skillsupertracker 竞品分析

> 日期：2026-08-23 ｜ 方法：web 检索 + GitHub API 实据（星标/许可/更新活跃度）+ 官方文档溯源 ｜ 所有关键数字附来源链接
> 注：盈利点与商业化分析不在此仓库（用户裁定：商业化内容只存 vault 想法池，不入项目仓库）。

## 摘要

1. **竞争格局**：本项目切的是「技能轨迹可视化 + 证据驱动的技能管理」细分。用量/成本分析是红海（ccusage 18.1k★ 主导 + 30+ 长尾工具），但**以「技能触发轨迹」为主数据模型的工具目前为零**——最接近的 cc-viewer（0★）只做通用会话图、ccstory（43★）只做叙事复盘，均无技能语义。
2. **DSH 细分位真空成立**：ccusage 的 Hermes Agent adapter 读取的是 `~/.hermes/state.db`（SQLite），而 DSH 存储是 `~/.dsh/sessions/**/session.jsonl.zstd`（JSONL+zstd 多帧）——**ccusage 目前覆盖不了 DSH**。本项目的 MVP 战场没有竞争者。
3. **市场准入前提**：DSH 生态太小，P1 Claude Code adapter 是触达主流市场的必经之路（计划已按此分期）。

## 一、市场地图：五层格局

| 层 | 代表玩家 | 数据源 | 与本项目关系 |
|---|---|---|---|
| **A. 用量/成本分析**（红海） | [ccusage](https://github.com/ccusage/ccusage) 18.1k★ 主导；Claud-ometer、ccstats、token-dashboard、CCMeter、VibeCodingTracker、sniffly、checkyouragent 等 30+ 长尾 | 各 CLI 本地 JSONL/DB → tokens/成本 | 横向相邻：同数据源、不同主数据模型（用量 vs 技能轨迹） |
| **B. 会话可视化/叙事**（稀疏） | cc-viewer（0★ 图可视化）、[ccstory](https://github.com/atomchung/ccstory)（43★ 叙事复盘） | 本地 JSONL → 图/文字 | 最近似但无技能语义、无管理动作 |
| **C. 技能市场与安装**（增长热点） | [vercel-labs/skills](https://github.com/vercel-labs/skills) 24k★（`npx skills`）、skills.sh 排行榜、find-skills（2.3M 安装）、ClawHub | 市场侧安装量 | 生态层：P2 替换推荐的数据源（skill_find 已对接 skills.sh） |
| **D. 企业级可观测**（不同战场） | [LangSmith](https://www.langchain.com/pricing)、[Langfuse](https://langfuse.com/)（open-core）、Helicone、Lineman.io | 生产 LLM 应用 trace | 不同场景：团队/生产，不直接竞争 |
| **E. DSH 生态**（真空） | zebbkira/dsh-skills-mcp-manager（管理）、dsh-better-sidebar（UI） | — | **本项目的 MVP 主场：轨迹分析零竞争者** |

## 二、重点竞品逐项分析

### 2.1 ccusage —— 赛道霸主（最需关注）

- **数据**（GitHub API 实据，2026-08-23）：[18,120★ / 809 forks](https://github.com/ccusage/ccusage)，Rust，MIT（站点页脚标注），持续活跃（当日仍在推送）
- **能力**（[官方文档](https://ccusage.com/)）：15+ 编码 CLI 的 tokens/成本分析（Claude Code、Codex、OpenCode、Amp、Droid、Codebuff、Hermes Agent、pi-agent、Goose、OpenClaw、Kilo、Kimi、Qwen、Copilot CLI、Gemini CLI），日报/周报/月报/会话视图、JSON 输出、离线定价缓存
- **与 DSH 的覆盖关系**（[hermes.md](https://ccusage.com/guide/hermes.md) 溯源）：其 "Hermes Agent (Experimental)" adapter 读 `$HERMES_HOME/state.db`（上游 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的 SQLite），而 **DSH 的存储是 `~/.dsh/sessions/**/session.jsonl.zstd`**（JSONL + 多帧 zstd）——两者不兼容，ccusage 读不了 DSH 日志
- **不做什么**：无技能触发轨迹、无产物节点、无技能管理动作（删除/冻结/选优）、无技能热度按名聚合、无会话树交互视图
- **对本项目的启示**：①它按「CLI 数据源」逐个适配的路线与本项目 adapter-first 架构同构，**它随时可能加一个 DSH adapter 或技能视图**——速度与差异化是唯一护城河

### 2.2 长尾用量/可视化工具（数据均 GitHub API 实据）

| 工具 | 星标 | 许可 | 现状 | 与本项目重叠 |
|---|---|---|---|---|
| [Claud-ometer](https://github.com/deshraj/Claud-ometer) | 126 | MIT | local-first 仪表盘（零遥测） | 用量/成本，无技能轨迹 |
| [ccstory](https://github.com/atomchung/ccstory) | 43 | MIT | Python，叙事复盘「ccusage 告诉你账单，ccstory 讲故事」 | 会话复盘，无技能语义 |
| [cc-viewer](https://github.com/jhhuh/cc-viewer) | 0 | 无 | Rust GUI 会话图可视化 | 图形最接近，但无技能/产物模型、无管理 |
| [sniffly](https://github.com/chiphuyen/sniffly) | — | — | Claude Code 仪表盘（含错误分析） | 用量+错误，无技能 |
| ccstats / token-dashboard / CCMeter / VibeCodingTracker / checkyouragent / llm-usage-tracker 等 | 数十~数百 | 多为 MIT | 30+ 同质工具 | 用量/成本单点 |
| @cuteribs/agent-session-viewer（npm） | — | — | 会话查看器 | 会话回放，无技能 |

**结论**：A/B 层没有任何工具把「技能」作为一等公民建模（技能名聚合、触发链、产物归因、按证据管理）——这是本项目唯一且清晰的空隙。

### 2.3 技能生态层（数据源与潜在吞噬者）

- **[vercel-labs/skills](https://github.com/vercel-labs/skills) 24k★**：`npx skills add/use/list/update/remove`，支持 68+ agent，skills.sh 目录+安装排行榜，find-skills 榜首 230 万安装（[36kr 报道](https://eu.36kr.com/zh/p/3883329457483784) 溯源）。它是**市场侧**，不管个人使用证据；若 Vercel 官方做「使用分析」功能，将覆盖本项目部分价值
- **find-skills**（2.3M 安装）：AI 能力搜索引擎，自带质检规则（安装量 1000+、官方源优先、<100★ 存疑）——它用**市场信号**选技能，本项目用**个人使用证据**选技能，互补而非替代
- **[Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/) 研究**：审计 3984 个技能，**36.82% 含安全缺陷、13.4%（534 个）严重级、76 个已确认恶意载荷**；Koi Security 另查 2857 个发现 341 个恶意——**「装的技能到底干了什么」的信任缺口是本赛道最未被满足的痛点**（本项目的 Blast Radius 安全审计主线即针对此，见 spec §八 P2）
- ClawHub、kejixiaoliang 技能管理器（299 插件）、Agent Forge（MCP World）——管理/安装侧，无轨迹分析

## 三、差异化定位（SWOT）

**S（优势）**
- 唯一以「技能触发轨迹」为主数据模型的工具（技能加载→工具调用→产物，按技能归因）
- DSH 首个适配器（含 vendored zstd 帧扫描正确性层——ccusage 要支持 DSH 也绕不开这层工作）
- 证据驱动的技能生命周期（选优/替换/冻结）+ Blast Radius 安全审计（P2），正面回应 ToxicSkills 揭示的信任缺口
- 零遥测本地优先，符合该生态用户画像（ccusage/Claud-ometer 均以此为卖点，说明是用户硬需求）

**W（劣势）**
- 零用户基础、MVP 只读、DSH 生态规模小
- 单兵项目 vs ccusage 18k★ 社区；市场侧 vs Vercel 24k★

**O（机会）**
- skills.sh 生态高速增长（技能「npm 化」刚起步）
- 技能安全审计是真空（Snyk 数据证明）
- 轨迹提炼（Trajectory-to-Skill，P3）可把工具从「消费证据」升级为「生产技能」

**T（威胁）**
- ccusage 增加 DSH adapter 或「工具调用计数」视图（它已按 CLI 逐个适配，惯性存在）
- Vercel/Anthropic 官方下场做使用分析
- 通用可观测平台（Langfuse 等）下沉到本地 CLI 场景

## 四、对产品决策的落地建议

1. **P1 Claude Code adapter 是市场准入前提**（计划已按此分期，维持不变）
2. **P2 安全审计为主线**（已合入 spec）：Blast Radius 权限着色 + 选优（forkprobe）+ 技能安全体检合并为同一条差异化主线，先于纯替换推荐；CI 无头回归断言提前到 P2
3. **持续监控 ccusage**：它加 DSH 数据源或技能视图是最大短期威胁信号（当前实测不支持 DSH 日志格式）
4. **与 skills.sh 生态保持单向依赖**（skill_find 已对接）；避免与 Vercel 市场侧正面竞争，专注「市场给选择、我们给证据」
5. **品牌心智位**：对外叙事从「又一个用量分析工具」改为「**技能的证据层**：谁被用过、用了有没有用、该装还是该换」

## 来源

- ccusage：[GitHub](https://github.com/ccusage/ccusage)（GitHub API 实据 18,120★）、[官网](https://ccusage.com/)、[Hermes 数据源文档](https://ccusage.com/guide/hermes.md)
- 36kr 报道（vercel-labs/skills 24k★、find-skills 2.3M 安装、Snyk ToxicSkills 数据）：https://eu.36kr.com/zh/p/3883329457483784
- Snyk ToxicSkills 原文：https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/
- 长尾竞品（GitHub API 实据）：Claud-ometer 126★、ccstory 43★、cc-viewer 0★ 等（2026-08-23 查询）
- 技能生态：https://www.skills.sh/ 、[anthropics/skills#278](https://github.com/anthropics/skills/issues/278)
