# R116 Web Browser screenshot preview

更新时间：2026-08-10

## 范围

补齐 Web Browser Automation 的截图可见闭环。此前 `showBrowserScreenshot()` 只显示截图字节数；本阶段让 Web UI 在安全边界内渲染 PNG、JPEG 和 WebP 预览，同时保持旧 Bridge、缺失字段和不受支持 host 的降级行为。

## 实现

- `src/web/compatibility.js` 新增 `normalizeBrowserScreenshot()`，只接受 `image/png`、`image/jpeg` 和 `image/webp`，线性校验 Base64，限制 8 MiB 编码载荷和 6 MiB 解码大小；缺失、非法或超限数据统一降级为 `browser_screenshot_invalid`，不把原始数据交给页面。
- `src/browser-automation-manager.js` 对 `page.screenshot` 的外部 host 结果使用专用公开 DTO，重新计算 bytes，不信任 host 上报的大小，不允许不支持 MIME、非法 Base64 或超限图片进入 Bridge 公共响应。
- Web 页面新增独立截图预览容器和 `<img>`，只使用受 parser 校验后的 `data:<mime>;base64,...`；不使用 `innerHTML`，不展示 host 原始结果。
- 截图状态包含 host/page 目标和当前 data URL；host/page 切换、Browser capability 关闭、页面消失、断线、logout 和页面生命周期清理都会移除 `src` 并清空状态，避免旧截图串到新 workspace/session。
- `check:r116` 覆盖 manager DTO、Web compatibility、Web app contract、PNG/JPEG/WebP、坏 MIME、坏 Base64、缺字段、超限和截图生命周期标记，并已接入 Bridge `postcheck`。

## 本次验证

| 验证 | 结果 |
|---|---|
| `npm run check:r116` | 通过 |
| `npm run check:browser` | 通过 |
| `npm run check:r88` | 通过 |
| `npm run check:web-live` | 通过 |
| `npm run check:r13` | 通过 |
| `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` | 通过；Docker runtime 按 opt-in 规则跳过 |
| `git diff --check` | 通过；仅有既有 LF/CRLF 转换提示 |

本阶段只修改 Node/Web UI、smoke 和文档，没有 ArkTS/HAP 改动；没有安装、启动、读取日志或测试设备。指定设备 `5KLBB25A10203862` 未被操作。

## 边界

真实受支持 Browser platform host、HarmonyOS Browser host、页面登录态隔离、恶意页面、真实上传/下载和完整 App Browser 动作仍属于第 16、23D 的现场验收门；本次 Web 源码闭环不将这些现场门误记为已验证。
