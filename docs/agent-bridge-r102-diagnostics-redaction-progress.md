# R102 Diagnostics URL 与凭证脱敏进度

更新时间：2026-08-10

## 已完成

- `tools/agent-bridge/src/diagnostics.js` 的 `redactDiagnosticText()` 现在统一处理 HTTP/HTTPS、WS/WSS 和 `file://` URL。
- URL 内的用户名、密码、路径、查询参数和非支持协议内容不会进入公开诊断报告；网络 URL 只保留无凭证 origin marker，文件 URL 使用稳定的 `[redacted-file-url]` marker。
- Bearer/Basic、token、access/refresh token、API key、client secret、authorization、cookie 和私钥字段统一脱敏；私钥文件路径继续使用 `[redacted-path]`。
- 保持 `DiagnosticsReport` schema、八组报告、大小限制、text/json export 和受控 `actionId` 兼容不变。

## 本次验证

- `node --check src/diagnostics.js`
- `node --check scripts/check-diagnostics-smoke.js`
- `node scripts/check-diagnostics-smoke.js`：通过，覆盖 wss/ws/file URL、URL 凭证、Bearer、API key、cookie 和私钥路径。
- `node scripts/check-agent-experience-smoke.js`：通过。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`：退出码 0。
- `git diff --check`：退出码 0；仅有既有 LF/CRLF 转换提示，无实际空白错误。

## 边界

本阶段只收口诊断导出文本的安全边界，不代表真实 Provider quota/账单、长会话 compaction、真机 Usage/Diagnostics 或跨平台安全存储已经完成。第 22、34 项继续保持“部分实现”；真实 Provider、真机和现场服务仍由 FIELD 轨道验收。本轮未构建、安装、启动或测试设备。
