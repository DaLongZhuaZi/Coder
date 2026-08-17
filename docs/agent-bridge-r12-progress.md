# Agent Bridge R12 Usage / Metadata Scope 收口

更新时间：2026-08-08

## 目标

在不改变旧客户端行为的前提下，收紧 `metadata.generate` 的 Agent/session/workspace/Provider/host 作用域，并把 Provider quota endpoint 从 Codex 专用环境变量扩展为受控的 Provider capability。真实 Provider 套餐、长会话 compaction、真实 metadata 和 App/真机展示仍由 FIELD 轨道验收。

## 本轮源码变更

- 新增 `tools/agent-bridge/src/metadata-scope.js`：
  - 校验 session、agent、provider、providerSession、workspace 和连接握手 hostProfileId 的一致性。
  - 旧 session 或旧客户端缺少 Agent/host 字段时只做兼容降级并返回 warning，不将不可信字段写回 Provider scope。
  - Provider 入参使用白名单，workspacePath 取 Agent/Provider 已绑定值；prompt、timelineSummary、diffSummary 有 UTF-8 上限和 credential/private-key 脱敏。
- `tools/agent-bridge/src/server.js` 的 `metadata.generate`：
  - 先执行 scope 校验，再检查当前 Provider 的 `generateMetadata` capability。
  - 只向 Provider 发送白名单 payload；异常返回稳定 `metadata_generation_failed`、remediation 和 warnings。
  - preview 结果补充 `confirmed=false`、scope 摘要和 `updatedAt`，不返回路径、凭证或原始 payload。
- `tools/agent-bridge/src/provider-usage-service.js`：
  - 支持 Provider `usageEndpoint`、`usageEndpointEnv` 和 `usageEndpointTokenEnv`，并保留 `AGENT_BRIDGE_CODEX_USAGE_URL` 兼容路径。
  - endpoint、重定向目标只接受 HTTPS，拒绝 embedded credentials；限制 3 次重定向、响应体 256 KiB 和请求超时。
  - token 只从显式环境变量读取，不进入结果、日志或持久化；HTTP/JSON/大小/重定向失败映射为结构化 `failureCategory`。
- Provider 构造器和 Provider profile runtime 仅保存 endpoint/环境变量名，不保存 token 值；配置仍可按 Provider 显式覆盖。

## 本轮实际验证

以下命令均在 `F:\DevEcoStudioProject\Coder` 执行并通过：

```text
node --check tools/agent-bridge/src/metadata-scope.js
node --check tools/agent-bridge/src/provider-usage-service.js
node --check tools/agent-bridge/src/server.js
node tools/agent-bridge/scripts/check-metadata-scope-smoke.js
node tools/agent-bridge/scripts/check-provider-usage-endpoint-smoke.js
npm --prefix tools/agent-bridge run check:r12
node tools/agent-bridge/scripts/check-provider-usage-smoke.js
node tools/agent-bridge/scripts/check-opencode-provider-usage-smoke.js
node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js
```

`check:r12` 已加入 `tools/agent-bridge/package.json`，并通过 `postcheck` 接入正式全量命令。Bridge 全量 `npm --prefix tools/agent-bridge run check` 本轮退出码为 0，且 postcheck 再次执行 R12 smoke；本轮未执行 SDK 23 HAP 构建，没有生成或安装 HAP，也没有向任何设备发送安装操作。

## 状态边界

- R12 Usage/Metadata scope 与 endpoint：源码和定向 smoke 已完成。
- 清单第 22、34 项：继续保持“部分实现”。关闭条件仍包括至少一个真实 Provider 的 turn usage、quota、compaction 和四类 metadata 现场证据，以及 App/真机展示验证。
- Provider endpoint 是只读能力，不建立后台轮询；缺 endpoint/凭证/真实字段时继续返回 `capability_unavailable` 或对应结构化失败，不伪造 quota。

## 后续任务

1. 用真实 Codex/OpenCode/Gateway Provider 验证 quota endpoint、长会话 usage/compaction、metadata timeout/cancel 和 scope 失败。
2. 继续 R6-WEB-3/R7/FIELD 的多标签、旧 Bridge、平台 Browser host、Voice 真机和跨平台 daemon 验收，不把本轮 mock/fixture 结果写成现场通过。
