# 《SkillSuperTracker 可行性、商业化与发展规划评估报告》评审与整合意见

> 日期：2026-08-23 ｜ 评审对象：想法池 `01-工作/想法池/SkillSuperTracker 项目可行性、商业化与发展规划评估报告.md`（只读，未改动原文）
> 对照基准：spec（`docs/superpowers/specs/2026-08-23-skill-trace-design.md`）、实施计划、竞品分析（`docs/research/2026-08-23-competitive-and-profit-analysis.md`）、GitHub 实证数据

## 一、总体评价

报告质量高：项目定位、痛点、架构选型与既定设计（spec D1–D8）**高度吻合**，商业化原则（「核心功能与数据 100% 本地开源，仅对高阶算力、资产化导出与团队协同收费」）与竞品分析结论（ccusage 先例：个人免费、增值收费）一致。但存在 **3 处需修正的事实偏差** + **1 处关键遗漏**，并贡献了 **4 个值得吸收进路线图的新能力**。

## 二、事实核查（报告主张 vs 既定事实）

| # | 报告主张 | 既定事实 | 结论 |
|---|---|---|---|
| 1 | 项目名「SkillSuperTracker」 | 用户 2026-08-23 明确裁定**统一命名 `skillsupertracker`**（全小写；GitHub 仓库/npm/spec 均已统一，spec §十.1） | ⚠️ 命名不一致，全文需统一为 `skillsupertracker` |
| 2 | 「后续拓展 Claude Code、**MCP**」 | spec P3 为「其他 agent adapter（Codex/Gemini/…）」；MCP 服务器管理是 zebbkira 管理器职责，非本工具边界（spec §六 白名单一节） | ⚠️ 「MCP」应改为「其他 agent（Codex/Gemini 等）」 |
| 3 | 竞品全景只列：云端 APM / MCP Inspector / Dify·AutoGen | **缺失最近邻**：ccusage（18.1k★，同为本地日志离线分析）、ccstory（43★）、cc-viewer（0★）、Claud-ometer（126★）、skills.sh 生态（24k★）、Snyk ToxicSkills 安全缺口——详见 `docs/research/2026-08-23-competitive-and-profit-analysis.md` | ⚠️ 竞品表只覆盖了远距品类，未覆盖最直接的本地工具群 |
| 4 | 路线图 Phase 2/3 内容与 spec §八 错位 | spec P2 = 替换推荐（skills.sh skill_find）+ 选优（forkprobe）；P3 = 其他 adapter + 产物依赖边。报告的 Phase 2（火焰图/回放）、Phase 3（轨迹提炼/CI 断言）**与 spec 不冲突但编排不同**，且报告路线图中**完全没有「选优/替换推荐」** | ⚠️ 分期需对齐：以 spec §八 为唯一事实源，报告新能力按「池」追加 |
| 5 | 风险「大图渲染性能→视口虚拟化/按需折叠」 | 与计划已知限制（elk 主线程布局、README known-limitations）一致；视口 culling 是有效增强 | ✓ 采纳为 P1+ 优化项 |
| 6 | 风险「日志协议漂移→版本探测+容错降级」 | 与 spec D8 五件套一致 | ✓ 已在计划落实 |
| 7 | 商业化「BYOK 诊断器 / Showcase 买断 / 赞助 / B2B 团队」 | 与竞品分析盈利点结论吻合（ccusage 赞助+affiliate 先例、Lineman.io 团队漏斗、安全体检付费点） | ✓ 方向一致；BYOK 诊断器≈「AI 技能诊断」与「安全体检」可合并为主线 |

## 三、报告贡献的 4 个新资产（建议吸收）

| 新能力 | 价值判断 | 建议落点 |
|---|---|---|
| **CI/CD 无头回归断言**：CI 中校验 Agent 运行是否触发异常技能调用路径 | ★★★★★ 差异化最强：把「黄金样本回归」（spec D8.1，本机脚本）升级为可发行能力，直接服务所有用 CI 的团队；与 spec §七 测试策略一脉相承 | spec P2 池（早于 P3，因黄金样本基建 MVP 就有） |
| **Trajectory-to-Skill 轨迹提炼**：成功轨迹一键提炼为标准 skill 声明 | ★★★★★ 与用户自身工作流（双模型协作、技能工程方法论）强契合；把工具从「消费证据」升级为「生产技能」 | spec P3 池 |
| **Time-Travel Scrubber 时间旅行回放**：按时间戳单步回放拓扑点亮与文件 Patch | ★★★★ 与只读时序树天然衔接，演示/复盘价值高 | spec P2 池（视觉化增强） |
| **Blast Radius 安全爆炸半径**：按读写权限对节点着色（只读/工作区修改/高危网络与系统操作）+ 凭据泄露阻断 | ★★★★★ 与竞品分析识别的 **ToxicSkills 安全审计主线**完全同向——Snyk 审计 3984 技能 36.82% 有缺陷；这是本项目最有支付意愿的差异化 | 与「选优/安全体检」合并为**安全审计主线**（P2 优先） |

## 四、整合提案（待用户批准后执行）

1. **命名**：报告及后续所有对外材料统一 `skillsupertracker`（全小写）——项目内已统一，外部材料起草时注意即可
2. **spec §八 分期表**以现有为准，追加四个新能力入池：
   - P2 池追加：`CI 无头回归断言`、`Time-Travel Scrubber`；**新增「技能安全体检（Blast Radius 权限着色 + ToxicSkills 式审计）」与「选优（forkprobe）」合并为安全审计主线，P2 优先级提到替换推荐之前**
   - P3 池追加：`Trajectory-to-Skill 轨迹提炼`
3. **spec §十 已定项**补充一条商业化原则：「核心功能与数据 100% 本地开源；增值收费面=托管算力（BYOK 免费）、资产化导出（Showcase 买断）、团队/CI 协同」——与竞品分析结论一致
4. **台账**：里程碑/关键决策同步上述调整；`docs/research/` 下本评审文档留档

## 五、决策点（请用户裁定）

- [ ] 是否将 §四 的四项整合提案合入 spec 与台账？（spec 修改按项目惯例经用户批准）
- [ ] CI 无头回归断言是否提前到 P2 优先实现（报告 Phase 3 原意 vs 我建议的 P2 池）？
- [ ] 安全审计主线（Blast Radius + 选优）是否正式取代「纯替换推荐」成为 P2 首要交付？
