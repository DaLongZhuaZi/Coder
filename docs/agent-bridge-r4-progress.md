# R4 Usage、Quota 与 Metadata 进度

更新时间：2026-08-07

## 本轮完成

- App `NGFAgentHomePage` 接入 `provider.usage.list`：按 host/session/agent/provider/window 请求，校验响应 scope 和 request id，展示 Provider、状态、套餐、来源、抓取/过期时间、quota windows、warnings 与结构化失败 remediation。
- 旧 Bridge 缺少 `providerUsage` 字段或 capability 为 false 时隐藏 Provider Usage 区域，既有本地 usage、ACP/profile 和聊天功能保持不变。
- `AgentBridgeModels` 增加 Provider Usage result/window/detail 强类型模型与 parser 默认值；缺失数值保持 unavailable，不伪造 quota。
- `ProviderUsageService` 增加请求 scope 归一化：Provider 不回显 host/session/agent/window 时使用当前请求 scope；仍限制 HTTPS、响应体大小和超时。
- App `AgentBridgeProviderOption` 现在解析 `capabilities.usageEvents` 与 `capabilities.metadataGeneration`；metadata 生成入口同时检查 Bridge flag 和当前 Provider capability，旧 Bridge/不支持 Provider 不再显示误导性入口。
- Codex App Server 现状已核实：`thread/tokenUsage/updated` 会规范化 turn usage 并附加到 completion；独立 metadata turn 支持 `sessionTitle`、`branchName`、`commitMessage` 和 `pullRequest`，不写入主 timeline。
- Codex App Server compaction producer 已补齐：同时处理 `thread/compacted` 与 `item/completed(type=contextCompaction)`，无论到达顺序如何都只发出一条 `usage.updated(kind=compaction)`，并绑定 Codex thread/session。
- `server.js` 的 usage 记录现在在事件缺少顶层 `providerId` 时按 session 反查 Provider，turn/compaction usage 不再以空 Provider 持久化；Provider Usage smoke 增加了该接线断言。
- OpenCode provider 已补齐 `step-finish` usage producer：规范化 input/output/reasoning/cache read/cache write/total token、cost、currency、session window 和 ISO 时间，并以 part id 去重。
- OpenCode provider 已补齐结构化 `compaction` producer：保留 auto/manual reason、before/after token 和时间，以 part id 去重；descriptor 宣告 `capabilities.usageEvents=true`。
- 新增 `check-opencode-provider-usage-smoke.js`，覆盖真实 step-finish 字段、重复 part、compaction 去重和 capability；已接入 `tools/agent-bridge/package.json` 的全量 `check`。
- Gateway provider 已按实际协议接入 usage：OpenClaw Responses 的 `response.completed` 与 Hermes Studio 的 `run.completed`/HTTP completion 会规范化 snake_case/camelCase token、cache、reasoning、cost/currency，并按响应 id 去重；两者 descriptor 均宣告 `capabilities.usageEvents=true`。
- Gateway 没有稳定的 compaction 事件契约，当前保持字段缺失而不推断；`check-gateway-provider-smoke.js` 已覆盖 OpenClaw 流式、Hermes Socket.IO 与 HTTP fallback usage。
- Codex fake App Server smoke 现覆盖 metadata 的四种 kind、branch 校验失败、临时 metadata session 清理和主 timeline 不污染；仍需真实/录制 Provider 响应的 timeout、cancel 与长会话证据。
- README、架构说明和对齐清单已更新为上述真实事实；第 22、34 项仍保持“部分实现”。

## 本次验证

定向 smoke 已通过（退出码 0）：

```text
node --check tools/agent-bridge/src/provider-usage-service.js
node --check tools/agent-bridge/src/desktop-launcher.js
node --check tools/agent-bridge/src/mcp-host.js
node --check tools/agent-bridge/src/server.js
node --check tools/agent-bridge/scripts/check-provider-usage-smoke.js
node --check tools/agent-bridge/scripts/check-protocol-alignment-smoke.js
node --check tools/agent-bridge/scripts/check-management-cli-smoke.js
node --check tools/agent-bridge/scripts/check-mcp-host-smoke.js
node tools/agent-bridge/scripts/check-provider-usage-smoke.js
node --check tools/agent-bridge/src/providers/codex-app-server-provider.js
node --check tools/agent-bridge/scripts/check-codex-app-server-provider-smoke.js
node tools/agent-bridge/scripts/check-codex-app-server-provider-smoke.js
node --check tools/agent-bridge/src/providers/opencode-provider.js
node --check tools/agent-bridge/scripts/check-opencode-provider-usage-smoke.js
node tools/agent-bridge/scripts/check-opencode-provider-usage-smoke.js
node --check tools/agent-bridge/src/providers/gateway-provider.js
node --check tools/agent-bridge/scripts/check-gateway-provider-smoke.js
node tools/agent-bridge/scripts/check-gateway-provider-smoke.js
node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js
node tools/agent-bridge/scripts/check-management-cli-smoke.js
node tools/agent-bridge/scripts/check-mcp-host-smoke.js
```

Bridge 全量检查已通过（在 Provider 来源回填、OpenCode/Gateway usage producer 和 Codex metadata fixture 接入后再次执行）：

```text
npm --prefix tools/agent-bridge run check
```

本次全量检查包含 provider usage/profile、协议对齐、CLI/MCP live、GitHub、Relay、daemon、浏览器、通知、Schedules、Loops、Chat Rooms 等 smoke，退出码 0。

SDK 23 HAP 构建已通过：

```powershell
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

结果为 `BUILD SUCCESSFUL`，仅保留既有 syscap 能力和 throw-handling 警告。本轮在 capability gate 修改后再次执行，最新构建耗时约 43 秒。

## 尚未关闭的门槛

- 需要真实 Provider 凭证和真实 HTTPS quota endpoint，验证 401/403、限流、响应变化、quota reset 和凭证不可用降级。
- 已用 fake App Server 覆盖 Codex compaction 双通道及两种到达顺序；仍需要 Codex/OpenCode/Gateway 真实或录制长会话 fixture，验证 usage/compaction 事件从产生、持久聚合、断线重连到 App 恢复的完整链路。
- fake fixture 已覆盖 metadata 四种 kind、结构化 branch 输出失败、临时 thread 清理和主 timeline 不污染；仍需要真实/录制响应的超时、取消、Provider 凭证和长会话证据。
- 需要确认 `usageEvents`/`metadataGeneration` 在 Provider 选择层按真实 session capability 收窄，而不是仅依赖全局协议 flag。
- 真实 Provider、跨平台凭证、HarmonyOS 真机和长会话现场证据仍作为关闭第 22、34 项的验收门。
