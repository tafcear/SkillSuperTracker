# SkillSuperTracker

**AI Agent 技能轨迹可视化独立本地工具** —— 把一次会话/一个项目展开成技能触发树/流程图，动态直观地看到：哪个 skill 怎么被触发、触发后产生了什么产物；每个节点可交互（右键：选优/替换/删除/更新/冻结，分层点亮）；附带跨会话技能使用热度统计（heat）与替换推荐。

> 命名：显示名 **SkillSuperTracker**；npm 包名与 CLI 为小写 `skillsupertracker`（npm 注册表限制）。

## 当前状态

**MVP 实施中/已交付**（2026-08-23）：`analyze`/`stat` CLI + 自包含时序树/热度视图已可用；写操作/推荐/选优 P1 起。

- 📄 设计文档（spec）：[`docs/superpowers/specs/2026-08-23-skill-trace-design.md`](docs/superpowers/specs/2026-08-23-skill-trace-design.md)

## 快速开始

要求 Node >=22.15（zstd 内置）。首次使用：

```bash
npm install
npm run build
```

分析一个会话（会话 id 或会话目录），生成自包含 HTML 并在浏览器打开：

```bash
node packages/cli/dist/cli.js analyze <session-id|dir> --open
```

或双击 `skillsupertracker.bat`。跨会话热度统计：

```bash
node packages/cli/dist/cli.js stat --open
```

运行测试：

```bash
npm test
```

## 核心决策速览

| 项 | 决策 |
|---|---|
| 形态 | 独立本地工具（非 DSH 插件），多 agent：**MVP 只用 DSH 起步**，架构 adapter-first（轨迹 schema agent 中立 + adapter 接口契约随 MVP 定稿；Claude Code P1 仅差实现） |
| 技术栈 | TypeScript/Node 全栈（Node ≥22.15 内置 zstd；vendored DSH `scanZstdFrames` 帧扫描正确性层） |
| 图引擎 | Cytoscape.js + cytoscape-elk；右键菜单 `cxttap` 自绘（不用停更的 cxtmenu） |
| 分发 | MVP：`npx skillsupertracker` + `.bat` 双击启动器；单 exe P2 观望 |
| MVP 范围 | DSH adapter（唯一）+ `analyze --open`/`stat` CLI + 单会话时序树（只读，节点含产物）+ heat 统计。不做任何写操作/推荐/选优 |
| 写操作（P1 起） | 软删除（quarantine 30 天）+ 冻结复用 zebbkira 管理器前言改写约定；dry-run + 备份 |

完整需求分层、架构决策（D1–D8）、安全边界、测试策略、分期计划见 spec。

## 已知限制（MVP）

- `stat` 每次全量解析所有会话（spec D7 允许），会话上百个时明显变慢——P1 的 node:sqlite 增量索引解决
- 时序树节点按类型着色（heat 在 stat 视图体现），按热度着色属后续打磨
- 大会话（数百节点）的 elk 布局在主线程计算（单文件无 Worker），布局期间界面短暂卡顿
- 仅在写操作上完全只读；技能目录管理（冻结/软删除等）P1 起分层交付

## License

**待定**（讨论中）。定案前本仓库不设 LICENSE 文件；未经许可请勿复制使用。
