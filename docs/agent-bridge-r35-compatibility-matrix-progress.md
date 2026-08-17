# R35 Compatibility matrix progress

更新时间：2026-08-09

## 目标

补齐 `serverInfo.compatibility` 在旧 Bridge 只提供 `minimumProtocolVersion` 时的协议判定，避免缺少支持列表或客户端协议时误报兼容。

## 本轮源码变更

- `diagnostics.js` 增加同协议族数字后缀比较，支持 `agent-bridge.v1` / `agent-bridge.v2` 和简单数字协议。
- 有最低协议但缺少客户端协议时返回 `unknown`；最低协议可比较且客户端过低时返回 blocking 的 `appTooOld`。
- 协议族不一致或元数据无法比较时返回 `unknown`；推荐协议只在可比较且客户端低于推荐版本时给出 `upgradeRecommended`。
- 新增 `check-compatibility-matrix-smoke.js`，覆盖 minimum-only、旧协议、缺协议、协议族不一致和显式支持列表矩阵，并注册到 `postcheck` 的 `check:r35`。

## 验证

- `node --check tools/agent-bridge/src/diagnostics.js`：通过。
- `node --check tools/agent-bridge/scripts/check-compatibility-matrix-smoke.js`：通过。
- `node tools/agent-bridge/scripts/check-compatibility-matrix-smoke.js`：通过。
- 既有 diagnostics/Agent Experience smoke：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过，退出码 0；`postcheck` 已实际执行 `check:r35`。
- 本轮未修改 ArkTS；不重复执行 SDK 23 HAP 构建或设备安装，沿用 R34 的 HAP/安装证据。

## 状态边界

R35 只关闭兼容性矩阵的源码子阶段。第 34 项仍保持“部分实现”，真实旧/新 Bridge、真实 Provider 长会话和真机兼容卡/诊断展示继续作为 FIELD 门。
