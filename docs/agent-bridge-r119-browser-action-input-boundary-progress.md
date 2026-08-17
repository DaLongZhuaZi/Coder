# R119 Browser action input boundary

更新时间：2026-08-10

## 目标

收口 Browser Automation action payload 在 Bridge 边界的 fail-closed 校验，避免外部 host 或客户端通过异常字段、超长输入或无界坐标把不受控数据送入浏览器执行器。

## 实现

- `tools/agent-bridge/src/browser-automation-manager.js` 新增统一 `validateBrowserActionPayload()`，由 `BrowserAutomationManager.action()` 在 capability、scope 和 preview/confirm 之前调用。
- `ref`、`sourceRef`、`targetRef` 限制为 256 UTF-8 bytes，拒绝空值和控制字符；`key` 限制为 128 bytes。
- `text`/`value` 等输入限制为 128 KiB，拒绝 NUL；evaluate 只接受非空、单一的 `function`/`functionSource`，沿用同一输入上限。
- drag 坐标限制在 0–100000，scroll delta 限制在 -100000–100000；旧 `toX`/`toY` 字段继续兼容并规范化为 `targetX`/`targetY`。
- click、fill、hover、select、download 等需要元素目标的 action 必须提供有效 `ref`；upload 保持既有 optional-ref 兼容语义，避免改变旧 host 的上传错误类别。
- validator 返回稳定 `failureCategory`、脱敏 message 和 remediation；无效 payload 不创建 plan、不进入 confirm，也不派发给 host。

## 自动化证据

本轮实际执行：

```text
node --check src/browser-automation-manager.js
node --check scripts/check-browser-action-validation-smoke.js
node scripts/check-browser-action-validation-smoke.js
node scripts/check-browser-automation-manager-smoke.js
node scripts/check-browser-automation-live-smoke.js
node scripts/check-browser-cdp-host-smoke.js
node scripts/check-protocol-alignment-smoke.js
npm run check:r119
```

上述定向命令均退出码 0；`check:r119` 已接入 `package.json` 的 `postcheck`，因此后续 Bridge 全量 `npm run check` 会重复覆盖该边界。

## 未关闭的现场门

R119 只证明 Bridge action 输入边界和既有 host/capability 合约的源码行为。第 16、23D 仍保持“部分实现”：受支持平台 Browser host、HarmonyOS App 全量动作、真实上传/下载、登录态、恶意页面、长流和跨设备现场尚未由本轮自动化替代。

本轮未修改 ArkTS/HAP，未构建、安装、启动或测试设备。后续若产生重大 App 更新，安装目标只能是 `5KLBB25A10203862`，并且只执行安装，不启动、不测试。
