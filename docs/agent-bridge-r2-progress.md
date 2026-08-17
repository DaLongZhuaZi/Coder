# Agent Bridge R2 落实进度

> 范围：Git 高风险写操作统一 Preview / Plan / Confirm。  
> 依据：`docs/agent-bridge-paseo-alignment.md` 的 R2 计划。  
> 记录规则：只记录本次实际完成的代码、命令和结果；未执行的项保持“未开始”。

## 当前状态

| 工作包 | 状态 | 目标 | 本次证据 |
|---|---|---|---|
| R2-A Git 状态指纹与计划管理 | 已完成 | 一次性 plan、repository/HEAD/index/worktree/upstream 绑定 | `workspace-git-plan-manager.js`；Git Plan smoke 通过。 |
| R2-B Bridge 高风险操作门禁 | 已完成 | discard、force push、merge、stash、branch delete、pull | `workspace-service.js`、`server.js`；Git 与 Git Plan smoke 通过。 |
| R2-C CLI/MCP/App 对齐 | 已完成 | 所有调用方消费同一 preview/confirm | CLI/MCP 已完成并通过 host/live smoke；App 已接入高风险 plan gate、Preview/Confirm 对话框、强类型 parser 和旧 Bridge 降级。 |
| R2-D 自动化与文档收口 | 已完成 | 定向 smoke、全量回归、清单状态更新 | Git/MCP/CLI/protocol 定向 smoke、Bridge 全量 check 与 SDK 23 HAP 构建均通过。 |

## R2-A 执行清单

- [x] 定义 Git repository snapshot 与稳定 fingerprint。
- [x] 新增一次性 `WorkspaceGitPlanManager`。
- [x] plan 绑定 workspaceId、repository realpath、HEAD、branch/upstream、index/worktree fingerprint、请求摘要、目标 ref/path 和有效期。
- [x] Preview 只执行只读 Git 查询并返回 affected paths、ahead/behind、目标 ref、风险和标准化参数。
- [x] Confirm 重新计算 snapshot，状态或请求变化时返回 `git_plan_stale`。
- [x] plan 在确认尝试时一次性消费，重复 confirm 和 Bridge 重启后失效。

## R2-B 执行清单

- [x] discard 强制 preview/confirm，并覆盖 tracked/untracked 风险。
- [x] force push 采用 force-with-lease，并绑定 remote/upstream/head。
- [x] merge 强制 preview/confirm，并绑定目标 ref 与冲突预检状态。
- [x] stash drop/pop 强制 preview/confirm，并绑定 stash ref。
- [x] branch delete 强制 preview/confirm，并阻断当前分支删除。
- [x] 可能覆盖或合并本地状态的 pull 强制 preview/confirm。
- [x] Stage、unstage 和普通 commit 保持现有兼容路径。
- [x] Bridge handler 不再允许调用方绕过 plan manager 直达 destructive method。

## R2-C 执行清单

- [x] 协议公共结果增加可选 preview、confirmed、planId、expiresAt、risk、snapshot 与 validation 字段。
- [x] CLI help、payload、结构化错误和非零退出码对齐。
- [x] MCP destructive annotations、planId schema 和 confirm guard 对齐。
- [x] App 增加强类型 Git plan/result parser。
- [x] App 高风险操作展示 affected paths、branch/ref、remote、ahead/behind、风险和过期提示。
- [x] 成功后只刷新当前 workspace Git scope。
- [x] 旧 Bridge 或 feature flag 缺失时保留现有低风险 Git 功能，并隐藏不能安全执行的高风险入口。

## R2-D 执行清单

- [x] 扩展 workspace Git smoke。
- [x] 扩展 protocol alignment、CLI live、MCP host/live 和 App parser 测试。
- [x] 将新 manager 与 smoke 纳入 `tools/agent-bridge/package.json` 的全量 `check`。
- [x] 执行 R2 定向检查。
- [x] 执行 Bridge 全量 `npm --prefix tools/agent-bridge run check`。
- [x] 如本轮实际修改 ArkTS，则在里程碑关闭时执行 SDK 23 HAP 构建。
- [x] 更新 README、架构说明、对齐清单和本进度文件。

## 验收记录

| 日期 | 操作 | 结果 | 证据 |
|---|---|---|---|
| 2026-07-30 | R2 源码基线核查 | 进行中 | `workspace-service.js`、server、protocol、CLI、MCP 与 App Git 工作流。 |
| 2026-07-30 | Git Plan 定向 smoke | 通过 | `node tools/agent-bridge/scripts/check-workspace-git-plan-smoke.js` → `workspace git plan smoke ok`。 |
| 2026-07-30 | MCP host smoke | 通过 | Git preview 到达 Bridge；confirm 缺 planId 阻断；字段别名规范化。 |
| 2026-07-30 | Management CLI smoke/live | 通过 | 高风险命令缺 `--preview` 返回非零；discard preview/confirm 真实 RPC 闭环通过。 |
| 2026-08-07 | R2 App parser/UI 静态收口 | 通过 | Git preview/confirmed/stale/legacy parser、feature flag 默认值、App Preview → Confirm 请求参数复用和旧 Bridge gate 已接入；ArkTS/HAP 尚未构建。 |
| 2026-08-07 | R2 定向 smoke | 通过 | workspace Git、Git plan、MCP host/live、management CLI/live、protocol alignment 均通过。 |
| 2026-08-07 | Bridge 全量 check | 通过 | `npm --prefix tools/agent-bridge run check` 退出码 0；Git Plan/Git、protocol alignment、CLI live、MCP host/live 及既有全量 smoke 均通过。 |
| 2026-08-07 | SDK 23 HAP 构建 | 通过 | `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace` 退出码 0；仅保留既有 system-capacity 与 throw-handling 警告。 |

## 尚未执行

- 真实远端认证、受保护分支和多人同时修改仓库属于现场验收。
