# skillsupertracker 项目全面评估报告

> 日期：2026-08-23 ｜ 方法：作者批判性自查（实证取证）+ Kimi 独立评审（kimi-coding/k3，项目双模型闭环惯例）
> 结论：**修复后 ready** —— Kimi 判定 not-ready（4 Critical + 7 Important + 7 Minor），全部 18 项已核实并合入计划（commit 193c820）；本报告为评估全记录。

## 一、评估范围与方法

| 对象 | 方法 |
|---|---|
| spec（设计文档，三轮 Kimi 评审已过） | 重读一致性检查 + 与计划逐条对账 |
| 实施计划（12 任务 TDD，3411 行） | ①作者自查：9 项技术论断**逐条本机实证**（不靠假设）②独立评审：workflow 派 kimi-coding/k3 只读评审（fresh context，只给文件路径与取证锚点） |
| 仓库/流程状态 | git 状态、License、发布路径、协议合规 |

实证清单（全部通过真实执行验证，非文档转述）：npm 11.17 拒绝 `workspace:*` 协议；vitest 4.1.11 忽略 `vitest.workspace.ts`（per-package alias 不加载）而 `test.projects` 生效；Node 24.19 类型剥离不重映射 `.js`→`.ts`；zod 4.4.3 `z.toJSONSchema`/`strictObject` 行为；cytoscape 3.34 + elk 2.3 无头布局可跑；vite-plugin-singlefile 2.3.3 构建后 `__TRACE_DATA__` 占位符留存；DSH 真实会话日志探针解码（头行/事件信封/打包行/skill tool-call 形状）；DSH 安装目录源码逐行核对（scanZstdFrames 端口与上游一致、SessionEventMap 契约）。

## 二、项目定位评估

- **问题真实**：20+ skills 重度使用场景下「看不见/看不懂/不好管/管不动」四痛点成立；与已装 zebbkira/dsh-skills-mcp-manager 的边界清晰（zebbkira=结构管理，本工具=使用轨迹可视化+数据支撑），spec §六 已把冻结约定复用对齐，无状态分裂风险。
- **形态合理**：独立本地工具而非 DSH 插件（用户裁定）；零遥测、纯本地隐私模型。
- **差异化成立**：现成工具检索（skillhealth/skill-tracker/skills_vis/skill-atlas）均不满足会话树+右键管理+推荐组合。
- **短板**：License 待定（public 仓库无 LICENSE = 默认保留所有权利，发布前必须定案）；npm 名与仓库名统一 skillsupertracker 已落实。

## 三、spec 质量评估

- 三轮评审闭环（Kimi 两轮设计/选型 + 终审有条件通过），3 Important + 8 Minor 已合入；D1–D8 决策均有证据链。
- 覆盖完整：目标/非目标、需求分层、架构决策、组件设计、安全边界、测试策略、分期、风险、已定项。
- 两处 spec 内部张力已识别并在计划中裁决：§五菜单含「更新」vs §六「定义清楚前不进菜单」→ 计划按 §六 排除（记录在案）；§二目标菜单描述含更新 → 同上处理。
- 风险表 §九 之外，本次评估补入的实操风险见第五节。

## 四、计划质量评估（核心）

### 4.1 作者自查发现并修复（第 1 轮，commit 7a57977）

| # | 问题 | 级别 | 实证/依据 |
|---|---|---|---|
| 1 | npm 不支持 `workspace:*`（EUNSUPPORTEDPROTOCOL）→ 改 0.1.0 版本区间 | Critical | 本机实测 |
| 2 | Node 类型剥离不映射 .js→.ts → anonymize.ts 改用 dist | Critical | 本机实测 |
| 3 | vitest 4 `--project` 语义变化 → 命令改位置参数 | Important | 本机实测 |
| 4 | Task 7 测试 Buffer 相加（字符串拼接破坏二进制）→ Buffer.concat | Important | 静态审查 |
| 5 | Task 11 树节点数断言 3≠4 | Important | 静态审查 |
| 6 | 菜单按 spec §六 去「更新」 | Important | spec 对照 |
| 7 | stat 损坏会话测试前提错误（宽松解析不抛错） | Important | 逻辑推演 |
| 8 | strictObject 使 schema 测试确定性成立；map.ts pendingSkills Map；测试清理等 5 项 | Minor | — |

### 4.2 Kimi 独立评审（第 2 轮，commit 193c820）

**判定：not-ready（4 Critical / 7 Important / 7 Minor）。** 强项确认：vendored 层与上游逐行一致、事件映射全部有源码锚点、脱敏采用「默认全遮+白名单放行」、范围纪律优秀、接口一致性高。

**4 Critical（全部核实属实并修复）：**

| # | 问题 | 核实结果 | 修复 |
|---|---|---|---|
| C1 | Task 7 kinds 断言漏 commit tool-call 节点（5 应为 6） | ✅ 属实（LOG_TEXT 第 7 个事件是 git_commit 调用） | 断言改 6 元素 |
| C2 | version-99 测试文件名 bad.zstd 无 .jsonl.zstd 后缀 → 走明文分支 | ✅ 属实（parse 按后缀选解码路径） | 改 bad.jsonl.zstd |
| C3 | fixtures.test.ts 路径少一级 `..` | ✅ 属实（packages/adapters/test 需上溯 3 级） | 改 `../../..` |
| C4 | vitest 4 忽略 vitest.workspace.ts → per-package alias 不加载 | ✅ **本机实证确认**（alias 报 Cannot find module；改用 test.projects 后通过） | 根 vitest.config.ts + projects；逐任务命令改 `npm test -w <pkg>` |

**7 Important（全部核实并处理）：** renderTraceHtml 的 `$&` 替换模式陷阱（改函数 replacer）；stat 冒烟 --root 层级错误（改 --root fixtures + 断言技能名）；D8.5 schema 产物未入库（新增 docs/schema/trace-v1.schema.json + 比对测试）；spec D6 npx 分发闭环（cli 补 files/prepublishOnly + 发布说明，实际发布待用户定夺）；vitest 过滤机制说明更正。

**7 Minor（全部处理）：** .bat 无参闪退（pause）；vendored 注释行号；anonymize 的 sourceRoot 白名单移除 + chunk time0 重基 + 撕裂行跳过计数；颜色=heat 简化补记 deviations；RowKind 死变体删除；elk 主线程布局已知限制入 README；stat 全量解析性能限制入 README。

### 4.3 修复后状态

18/18 项全部合入，计划无已知未决缺陷。两次评估修复共 commit：7a57977（自查）、193c820（Kimi）。

## 五、风险全景（spec §九 之外的本轮新增）

| 风险 | 等级 | 处置 |
|---|---|---|
| npm 发布闭环未实跑（core/adapters 现为 private，发布顺序、registry 解析未验证） | 中 | 已备 files/prepublishOnly + 版本区间；发布前需实跑 `npm pack` 三包验证 |
| vitest 4 工具链变化（workspace→projects 已适配，未来大版本可能再变） | 低 | devDeps 钉 `*` 换取适配风险；如需稳定可后续钉版本 |
| 单文件 HTML 体积（cytoscape+elk 内联，估计 1-2MB） | 低 | 本地工具可接受；记录在案 |
| DSH 升级漂移 | 高（spec 已列） | 黄金样本回归已就位；补充：DSH 上游目前 unreleased（version 0 无兼容承诺），夹具需随升级重生成 |
| License 待定 | 高（发布前必解） | 用户与作者讨论中；定案前不发布 |

## 六、结论与建议

1. **设计成熟度**：spec 三轮评审 + 全部决策有据，无重大缺口。
2. **计划可执行性**：经两轮评估修复后，12 个任务的 TDD 循环无已知致命缺陷；所有关键技术论断均已实证。
3. **建议**：可以开工。执行方式维持既定选择（子代理驱动推荐 / 本会话内联）；开工后按任务粒度继续「每任务 Kimi 复核」惯例；License 在首次发布前定案。

## 附：评审证据

- 实证记录：本机 Node/npm/vitest/zod/cytoscape/vite 全部实测输出（执行于 2026-08-23 21:3x–21:5x）
- Kimi 评审完整报告：见会话记录与调用日志 `2026-08-23-205523-DSH.md`（workflow agent kimi-coding/k3）
- 修复提交：7a57977、193c820（均推送 main）
