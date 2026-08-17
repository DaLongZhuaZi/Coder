# Agent Bridge R128 Browser platform action capability progress

更新时间：2026-08-10

## 目标

收紧显式 HarmonyOS/platform Browser host 的 `page.action` 注册边界，避免平台 host 在没有声明真实动作能力时回退到旧版任意 action 语义。该阶段只处理 Bridge 注册与 dispatch 前的 capability gate，不宣称已有 HarmonyOS Browser adapter 或现场浏览器能力。

## 实现

- `BrowserAutomationManager.registerHost()` 将 `page.action` 的动作能力声明区分为显式和 legacy 两种状态。
- `hostKind=harmonyos` 或 `capabilitySource=platform` 的 host 如果声明 `page.action` 但缺少 `supportedActions`，返回 `browser_host_action_capabilities_required`，不注册 host。
- 显式传入空的 `supportedActions` 返回 `browser_host_capabilities_invalid`；非空列表继续经过既有 action allowlist 归一化。
- external/CDP/native/custom host 保持旧客户端兼容：仅声明旧 `supportedCommands` 时仍可注册，但单个未声明 action 仍在 preview/dispatch 前返回 `browser_action_unavailable`。
- 没有修改安全审计、工作区 scope、URL/path 脱敏、上传下载摘要或平台 adapter 默认不可用策略。

## 验证

- `node --check src/browser-automation-manager.js`：通过。
- `node --check scripts/check-browser-automation-manager-smoke.js`：通过。
- `npm run check:browser`：通过，覆盖平台 host 缺 action capability、显式 `click` capability 和旧 external host 兼容。
- Browser live smoke：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过，包含 R128 依赖的 Browser 及全量 postcheck 回归；Docker runtime 按 opt-in 规则跳过。
- `git diff --check`：通过，无新增空白错误。

## 未关闭的现场边界

当前 Bridge 仍只提供 Chromium CDP 真实 host，默认 `browserPlatformHost=false`。真实 HarmonyOS/platform adapter、恶意页面与登录态隔离、真实上传下载、真机全量动作和长流仍需现场验收，因此第 16 项与第 23D 项继续保持“部分实现”。本轮仅修改 Node Bridge/smoke 与文档，不构建、安装或操作设备。
