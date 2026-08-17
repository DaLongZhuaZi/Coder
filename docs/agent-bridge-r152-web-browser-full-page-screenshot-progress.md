# R152 Web Browser Full-page Screenshot

日期：2026-08-11  
状态：已完成（Web Browser 整页截图源码子阶段；第 16、23B、23D 仍为部分实现）

## 目标

核查 Web Browser 工作台的截图请求是否真实消费 Bridge 已存在的 `fullPage` 协议字段。此前 Web 已能请求、校验并渲染截图，但请求固定发送 `fullPage=false`，因此用户无法从 Web 控制面触发整页截图。

## 已实现

- Browser 区新增 `Full-page screenshot` checkbox，默认关闭，保持旧协议和旧用户行为。
- Web 状态新增 `screenshotFullPage`，只在用户显式选择时向 `browser.page.screenshot` 发送 `fullPage=true`。
- 截图响应继续通过 `normalizeBrowserScreenshot()` 校验 PNG/JPEG/WebP、Base64、签名和大小，并保留服务端回显的可选 `fullPage`。
- 请求继续绑定 connection generation、hostId 和 pageId；host/page 切换或断线后的迟到截图不会覆盖当前页面。
- Web 不使用 `innerHTML` 渲染截图，图片只来自已校验的 `data:` URL；旧 Bridge 缺少 `fullPage` 时安全回落为 `false`。
- `check:r152` 已加入 `postcheck`，防止截图请求重新硬编码 `fullPage=false`。

## 自动化证据

本轮实际通过：

```text
npm run check:r152
npm run check:r116
npm run check:r13
npm run check:r88
npm run check:browser
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check
```

定向 smoke 覆盖 `fullPage=true` parser、Web checkbox、请求 payload、禁止硬编码 `false`、截图 MIME/签名/大小校验、scope generation 和安全 DOM 边界。Bridge 全量检查退出码为 `0`，`postcheck` 实际执行并通过 `check:r152`；Docker runtime smoke 按 opt-in 规则跳过。

R152 只修改 Node/Web、smoke、package script 和文档，没有 ArkTS/HAP 改动，因此不执行 SDK 23 HAP 构建，也不进行设备操作。

## 未关闭的现场门

- 真实受支持的 platform Browser host 与对应平台 capability 注册。
- 真实 CDP/Chromium 页面上的整页截图、上传、下载、弹窗、跨域、恶意页面和登录态隔离。
- 旧 Bridge、真实多标签、长流和浏览器刷新/恢复现场。
- HarmonyOS 真机 Browser 能力仍按独立现场轨道验收；如后续需要安装 HAP，只允许安装到 `5KLBB25A10203862`，不得启动、测试、读取日志或操作其他设备。

上述现场门未完成前，不把第 16、23B、23D 对齐项标记为“已实现”。
