# R42 Browser Request Scope Integrity

更新时间：2026-08-09

## 目标

补齐 HarmonyOS App Browser 工作台的响应目标完整性。Browser 请求不能只依赖 request id：确认请求时记录的 `workspaceId`、`hostId`、`instanceId`、`pageId` 必须与响应中实际提供的可选 scope 一致；缺少这些旧字段时保留兼容，发生冲突时消费并丢弃该请求，避免迟到结果污染当前页面。

本阶段不宣称提供新的 HarmonyOS Browser host，也不关闭第 16 或第 23D 的现场门。

## 实现

- 新增 `entry/src/main/ets/features/agentHome/AgentHomeBrowserRequestCoordinator.ets`，统一保存 Browser pending request 的 action 和 host/instance/page/workspace scope。
- `consume()` 以 envelope request id 优先、payload request id 兼容；多请求场景缺 request id 时拒绝猜测，单请求旧 Bridge 仍可关联。
- 响应的顶层 workspace/host、instance、page 以及对应列表条目会对已知 scope 做一致性校验。
- 目标 scope 冲突会一次性消费 pending request 并返回 `staleScope`，不会把错误结果留在队列中反复污染 UI；缺少 optional scope 字段仍按旧协议接受。
- `NGFAgentHomePage` 的 Browser begin/complete/clear 生命周期改由 coordinator 管理，host 切换、页面离开和断线清理继续复用现有入口。

## 验证

- `entry/src/test/AgentHomeBrowserRequestCoordinator.test.ets` 覆盖匹配响应、host 冲突、多个 legacy 无 request id、optional scope 缺失兼容和清理。
- `entry/src/test/List.test.ets` 已注册该纯逻辑测试。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`entry:default@CompileArkTS` 和 `entry:assembleHap` 通过；仅保留既有 syscap、弃用 API、异常声明警告。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check:browser`：退出码 0，Browser manager、CDP、live 和 protocol alignment smoke 通过。
- `git diff --check`：无新增阻断问题，仅有工作区既有换行提示。

## 边界

- 本阶段未安装、启动、测试、读日志或截图设备。
- `browserPlatformHost=false` 仍保持；真实 HarmonyOS/WebView host、桌面 host、恶意页面、登录态、真实上传下载和真机全量动作仍属于第 16、23D FIELD 门。
