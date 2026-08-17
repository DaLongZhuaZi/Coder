# R34 Compatibility protocol summary progress

更新时间：2026-08-09

## 目标

补齐第 34 项中兼容卡所需的协议版本摘要。Bridge 已返回协议最低版本、建议版本和支持列表，但 App 旧 parser 只保留 App/Bridge 版本，导致协议兼容范围无法在 UI 中核对。

## 本轮源码变更

- `AgentBridgeCompatibilityInfo` 新增可选 `minimumProtocolVersion`、`recommendedProtocolVersion` 和 `supportedProtocolVersions`。
- `AgentBridgeServerInfo` 新增顶层 `supportedProtocolVersions`，`parseServerInfo()` 在 compatibility 缺少列表时从顶层安全补齐。
- `buildCompatibilityInfo()` 统一生成协议摘要字段，Bridge `serverInfo` 构建显式传入 `minimumProtocolVersion`。
- 兼容卡的要求摘要现在同时显示 App、Bridge 和协议的最低/建议版本，以及支持协议列表。
- App parser 测试和 Bridge diagnostics smoke 增加协议字段断言。

## 验证

- `node --check tools/agent-bridge/src/diagnostics.js`：通过。
- `node --check tools/agent-bridge/scripts/check-diagnostics-smoke.js`：通过。
- `node tools/agent-bridge/scripts/check-diagnostics-smoke.js`：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过，退出码 0。
- SDK 23 `assembleHap --no-daemon --stacktrace`：通过，`BUILD SUCCESSFUL`；HAP 大小 `14,217,896` bytes，SHA-256 `730A331A6A8BEAEEDF20D4CA3EC0B809474D2ABA6FFC4FE16BC4AF97CF5F5089`。
- `git diff --check`：通过；仅保留仓库既有换行格式提示。
- 指定设备安装：目标 `5KLBB25A10203862` 在线，仅执行一次 `hdc -t 5KLBB25A10203862 install -r`；返回 HDC `9568423`（当前签名 profile 未授权设备 UDID）。未启动、未截图、未读日志、未做设备测试，也未向其他设备安装。

## 状态边界

R34 只关闭协议摘要的源码子阶段。第 34 项继续保持“部分实现”，因为真实旧/新 Bridge 版本矩阵、真实 Provider 用量数据和真机诊断/兼容卡展示尚未现场验收。
