# R66 Provider usage response scope integrity

更新时间：2026-08-09

## 目标

收口第 22、34 项中 Provider usage 结果的作用域完整性：Provider usage endpoint 或 adapter 返回的 `hostProfileId`、`sessionId`、`agentId` 和 `window` 不能覆盖 Bridge 请求已经确定的作用域，避免 quota snapshot 被写入错误的 Host 或会话。

## 实施

- `tools/agent-bridge/src/provider-usage-service.js`
  - `usagePayloadForConnection()` 产生的请求作用域作为权威输入。
  - Provider 返回的作用域字段只作为不可信数据；请求字段存在时强制覆盖响应值。
  - 检测到响应冲突时增加稳定的 `provider_scope_response_ignored` warning，不回显冲突值。
  - 请求 window 存在时同样优先使用请求值；无作用域的旧调用保持响应兼容。
- `tools/agent-bridge/scripts/check-provider-usage-scope-integrity-smoke.js`
  - 覆盖恶意/错误 Provider scope、quota event scope 以及旧无 scope 调用兼容。
- `tools/agent-bridge/package.json`
  - 新增 `check:r66`，并接入 `postcheck`。

## 验证

本阶段实际通过：

- `node --check src/provider-usage-service.js`
- `node --check scripts/check-provider-usage-scope-integrity-smoke.js`
- `node scripts/check-provider-usage-scope-integrity-smoke.js`
- `npm run check:r30`
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`（退出码 0，包含 `check:r66`、既有 provider/usage/metadata、Web、Voice、GitHub、daemon、MCP/CLI 和 postcheck）
- `git diff --check`（退出码 0；仅有既有工作区 LF/CRLF 提示）

该阶段为 Node/Bridge-only 变更，不生成或安装 HAP，不执行设备启动、日志、截图或测试。

## 边界

- 真实 Provider quota、账单、长会话 compaction、真机展示仍属于第 22/34 项现场验收门。
- 本阶段没有改变 Provider 的认证、endpoint 或 secret store 语义；只强化结果作用域的权威来源。
