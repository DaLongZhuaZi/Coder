# R58 Daemon Config CLI/MCP 收口进度

更新时间：2026-08-09

## 范围

本阶段只收口 M4 远程 daemon 配置的 CLI/MCP 调用面，不把单机源码证据误记为第 14 项整体完成。Bridge 仍负责自身实例的配置状态；CLI/MCP 只通过 live Bridge RPC 操作，不旁路修改本地 provider 或 daemon store。

## 已完成

- [x] `daemon config status/fetch/validate/preview/apply/rollback` 已在管理 CLI 参数解析和执行路径中映射到对应 `RequestType`。
- [x] CLI 通过 `liveManagementRpcForCli()` 转发 live RPC；无运行中的 Bridge 返回 `live_bridge_required`，不会回退到本地 remote-config manager。
- [x] CLI 结构化失败保留 `failureCategory`、`message` 和 `remediation`，并以非零退出码结束；成功结果仍输出 JSON。
- [x] MCP 暴露 `daemon_config_status`、`daemon_config_validate`、`daemon_config_fetch`、`daemon_config_preview`、`daemon_config_apply` 和 `daemon_config_rollback`。
- [x] MCP annotations 已按风险收敛：status/validate/preview 为只读，fetch 为 open-world，apply/rollback 为 destructive；apply/rollback 缺少 `confirm=true` 时在触达 Bridge 前返回 `confirmation_required`。
- [x] MCP 工具映射继续使用公共 `RequestType`，不建立平行后端或本地写入路径。

## 本轮验证

实际执行并通过：

```text
node --check tools/agent-bridge/src/desktop-launcher.js
node --check tools/agent-bridge/src/mcp-host.js
node --check tools/agent-bridge/scripts/check-management-cli-live-smoke.js
node --check tools/agent-bridge/scripts/check-mcp-live-smoke.js
node tools/agent-bridge/scripts/check-management-cli-live-smoke.js
node tools/agent-bridge/scripts/check-mcp-live-smoke.js
```

其中 management CLI live smoke 覆盖 daemon config status、无 fetched config 的 preview 结构化失败和无 live Bridge 的 `live_bridge_required`；MCP live smoke 覆盖工具 annotations、status/preview 调用以及未确认 apply 阻断。随后执行的 Bridge 全量 `check`（含 `postcheck`）和 `git diff --check` 也通过。

## 未关闭的现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启、真实签名远程配置。
- [ ] 双 Bridge rolling restart/update/rollback、真实 App Fleet 聚合和连续 heartbeat/generation 现场。

因此第 14 项仍保持“部分实现”。
