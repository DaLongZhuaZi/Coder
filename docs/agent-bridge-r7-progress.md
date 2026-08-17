# Agent Bridge R7 Browser Automation 进度

## 目标

依据对齐清单第 16、23D 项，收口 Browser Automation 的 action 级 capability、Chromium CDP 拖拽、元素可操作性检查、Web 完整控制面和安全/兼容回归；受支持平台 host、HarmonyOS App 完整操作面和真实浏览器现场验收仍单独保留。

## 本轮源码完成

- [x] `browser.host.register` 支持可选 `supportedActions`；Bridge 公开 action capability，并在 page action dispatch 前按 host 的显式列表筛选。
- [x] 新 host 声明 `page.action` 但不支持目标 action 时返回稳定 `browser_action_unavailable`；只声明旧 `supportedCommands` 的 host 保留兼容路由。
- [x] Chromium CDP host 注册完整 action 列表，拖拽支持 source ref + target ref 或有界坐标，使用 `mousePressed -> 分段 mouseMoved -> mouseReleased`，异常路径确保释放鼠标。
- [x] click、fill、type、select、upload、drag、download 在执行前通过 DOM box、visible、enabled 和连续布局检查；refs 在写操作后继续失效。
- [x] MCP action schema 增加拖拽目标坐标和步数；协议对齐 smoke 断言 capability gate、CDP drag 和注册字段。
- [x] manager、CDP、live smoke 覆盖 capability 不匹配、旧 host 兼容、拖拽、stale ref、不可见元素和断线清理。
- [x] Web Browser 工作台接入 host 选择、instance list/create/close、page create/list/close、navigate/back/forward/reload、snapshot、screenshot、logs、wait、download list、permission 和全部 action；页面写操作继续使用 Bridge preview/confirm，host 未声明能力时隐藏按钮。
- [x] Web 上传路径只接受 workspace-relative 输入并在进入 Bridge 前拒绝绝对路径和 `..`；所有动态内容使用 DOM API，不使用 `innerHTML` 或持久化凭证。

## 本次真实验证

执行日期：2026-08-08，工作区 `F:\DevEcoStudioProject\Coder`。

| 验证 | 结果 |
|---|---|
| `node --check src/browser-automation-manager.js` | 通过 |
| `node --check src/browser-cdp-host.js` | 通过 |
| `node scripts/check-browser-automation-manager-smoke.js` | `browser automation manager smoke ok` |
| `node scripts/check-browser-cdp-host-smoke.js` | `browser CDP host smoke ok` |
| `node scripts/check-browser-automation-live-smoke.js` | `browser automation live smoke ok` |
| `node --check src/web/app.js` | 通过 |
| `node scripts/check-web-ui-contract-smoke.js` | `web UI contract smoke ok` |
| `node scripts/check-web-ui-live-smoke.js` | `web UI live smoke ok` |
| `npm run check:browser` | 通过，含 protocol alignment smoke |
| `npm run check` | 通过，退出码 0；包含 Web contract/live/GitHub 与 Browser 定向检查 |

## 当前剩余门

第 16、23D 继续保持“部分实现”。Bridge/CDP 和 Web 控制端源码已形成完整操作闭环，但仓库没有可真实宣称的 Electron、HarmonyOS 或其他受支持平台 browser host，HarmonyOS App 也仍保留基础入口而非全量动作工作台。需要真实 desktop/platform host、真实上传下载、恶意页面/登录态和现场 capability 证据后，才可关闭对应清单项。
