# R103 Browser warning URL 脱敏进度

更新时间：2026-08-10

## 已完成

- `BrowserAutomationManager.sanitizeCapabilityWarningText()` 改为匹配所有带 `://` 的 URL scheme。
- HTTP/HTTPS、WS/WSS 统一替换为兼容的 `[url]` marker；`file://`、`ssh://`、`ftp://` 等非支持协议也只保留 `[url]`，不暴露路径、authority、用户名、密码或查询参数。
- 该函数继续被 host capability warnings、公共 host result 文本和 Browser logs 复用；路径、Bearer/token/password/secret 等既有脱敏规则保持不变。

## 本次验证

- `node --check src/browser-automation-manager.js`
- `node --check scripts/check-browser-automation-manager-smoke.js`
- `node scripts/check-browser-automation-manager-smoke.js`：通过，覆盖 wss/ws/file/ssh URL、URL 凭证和私钥路径。
- `node scripts/check-browser-automation-live-smoke.js`：通过。
- `node scripts/check-browser-cdp-host-smoke.js`：通过。
- `node scripts/check-browser-event-scope-smoke.js`：通过。
- `npm --prefix tools/agent-bridge run check:browser`：退出码 0。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`：退出码 0。
- `git diff --check`：退出码 0；仅有既有 LF/CRLF 转换提示。

## 边界

本阶段只收口 Browser 公共 warning/log 文本的 URL 边界，不等同于真实 desktop/platform host、HarmonyOS App 全量动作、真实上传下载、恶意页面和登录态隔离已完成。第 16、23D 继续保持“部分实现”，现场验收仍单独记录。本轮未构建、安装、启动或测试设备。
