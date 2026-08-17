# R137 Web Browser host capability/readiness gate

## 目标

将 `browser.host.list` 的 Web 消费从原始 JSON 降为强类型 host DTO，并让平台 Browser host 的能力、连接和 readiness gate 与 Bridge 保持一致；旧 external/CDP host 缺少新字段时继续兼容。

## 已实现

- `tools/agent-bridge/src/web/compatibility.js` 新增 `normalizeBrowserHost()`、`normalizeBrowserHostList()`、`browserHostGate()`、`browserHostSupportsCommand()` 和 `browserHostSupportsAction()`。
- 平台 host 由显式 `platformHost` 或 `hostKind=harmonyos`/`capabilitySource=platform` 识别；必须同时满足 `browserHostCapabilityMetadata=true`、`browserPlatformHost=true`、`connected=true` 和 `readiness=ready`，否则 Web 不显示可执行命令或 action。
- 外部/CDP/native/custom host 缺 `readiness`/`connected` 字段时使用 `legacy`/connected 安全默认值；显式 `degraded`、`unavailable` 或 disconnected 仍被 gate 阻断。
- `browser.host.list` 同时兼容 `{ hosts: [...] }` 和旧数组响应，host 元数据数组、warning、命令和 action 均受长度和类型限制。
- `src/web/app.js` 统一使用 parser 和 gate；host 卡显示 connected/readiness/unavailable 摘要，命令和敏感 action 使用同一 capability gate。
- 新增 `scripts/check-web-browser-host-capability-smoke.js`，覆盖现代平台 host、缺 capability、未连接、degraded、旧 external host 和旧响应形态。
- `check:r137` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`。

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r137`：通过，输出 `web browser host capability smoke ok`。
- `node --check src/web/compatibility.js`：通过。
- `node --check src/web/app.js`：通过。

## 范围边界

本阶段只完成 Web host DTO 和 readiness/capability gate，不代表真实 HarmonyOS Browser adapter、恶意页面/登录态、真实上传下载、长流、多标签或 App 全量 Browser 动作已完成；第 16、23B、23D 继续保留 FIELD 验收门。

## 后续现场门

- [ ] 至少一个真实受支持 platform Browser host 注册并执行完整 action 生命周期。
- [ ] HarmonyOS App 真机全量 Browser 动作、上传下载、恶意页面/登录态和长流验证。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。
