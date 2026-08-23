# skillsupertracker

**AI Agent 技能轨迹可视化独立本地工具** —— 把一次会话/一个项目展开成技能触发树/流程图，动态直观地看到：哪个 skill 怎么被触发、触发后产生了什么产物；每个节点可交互（右键：选优/替换/删除/更新/冻结，分层点亮）；附带跨会话技能使用热度统计（heat）与替换推荐。

## 当前状态

**设计阶段完成，待实施。** 三轮 Kimi 评审闭环（2 轮设计/选型 + 1 轮 spec 终审），全部裁定已合入设计文档。

- 📄 设计文档（spec）：[`docs/superpowers/specs/2026-08-23-skill-trace-design.md`](docs/superpowers/specs/2026-08-23-skill-trace-design.md)
- 下一步：writing-plans 出实施计划 → MVP（约 2 周）

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

## License

**待定**（讨论中）。定案前本仓库不设 LICENSE 文件；未经许可请勿复制使用。
