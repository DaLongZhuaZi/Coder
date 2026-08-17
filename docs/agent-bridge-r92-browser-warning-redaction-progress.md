# R92 Browser host warning 公共边界

更新时间：2026-08-09

## 目标

阻止外部 Browser host 将 URL、绝对路径、Bearer/token/password 等敏感值通过 capability warning 带入 Bridge 公共 DTO、事件和 App/Web 展示。

## 实施状态

- [x] `normalizeCapabilityWarnings()` 继续限制控制字符、长度和数量。
- [x] URL、Windows/Unix 常见绝对路径、Bearer 和 credential key/value 统一替换为稳定占位符。
- [x] 保留普通诊断文本，重复 warning 继续去重；不改变 host readiness、capability gate 或 dispatch 行为。
- [x] Browser manager smoke 增加 URL、路径和 credential 泄露断言。

## 验证

- `node --check src/browser-automation-manager.js`：通过。
- `node --check scripts/check-browser-automation-manager-smoke.js`：通过。
- `node scripts/check-browser-automation-manager-smoke.js`：`browser automation manager smoke ok`。
- Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；Browser manager/CDP/live、Web contract/live/GitHub、Voice、Usage/Metadata、daemon、MCP/CLI 和全部 postcheck 均通过。Docker runtime 按仓库规则受控跳过（未设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1`）。
- `git diff --check`：无实际空白错误，仅有既有 LF/CRLF 转换提示。

## 现场门

- [ ] 真实受支持 Browser host、恶意页面、登录态、上传/下载和 HarmonyOS App 全量动作。
- [ ] 旧 Bridge、长流、多标签和设备现场。

第 16、23D 继续保持“部分实现”；本阶段只关闭公共 warning DTO 的源码安全子阶段。
