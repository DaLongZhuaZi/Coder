# R93 Browser host log public DTO redaction

更新时间：2026-08-09

## 目标

阻止外部 Browser host 通过 `browser.page.logs` 把 URL、绝对路径、Bearer/token、cookie、header 或其他 credential 字段带入 Bridge 公共结果、App/Web 展示和日志面板。

## 实施状态

- [x] `page.logs` 结果在 Bridge 公共边界使用 allowlist 式递归归一化。
- [x] 文本清理控制字符、URL、Bearer/credential 片段和 Windows/Unix 常见绝对路径。
- [x] 过滤 `headers`、`cookies`、`authorization`、`token`、`secret`、`password`、private-key 等敏感键。
- [x] 限制日志条数、嵌套深度、对象键数和 UTF-8 文本大小，并保留显式 `truncated`。
- [x] 外部 host 日志与 CDP host 结果都在同一 manager 公共结果边界处理，不改变 host readiness、action capability 或 page lifecycle。

## 验证

- `node --check src/browser-automation-manager.js`：通过。
- `node --check scripts/check-browser-automation-manager-smoke.js`：通过。
- `node scripts/check-browser-automation-manager-smoke.js`：通过（`browser automation manager smoke ok`）。
- `npm run check:browser`：退出码 0；manager、event scope、CDP、live automation 和 protocol alignment 均通过。
- Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；service/browser/Web、daemon、Voice、Usage/Metadata、MCP/CLI 和全部 postcheck 均通过。Docker runtime 按仓库规则受控跳过（未设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1`）。
- `git diff --check`：退出码 0，无实际空白错误，仅有既有 LF/CRLF 转换提示。

## 现场门

- [ ] 真实受支持 Browser host、恶意页面、登录态、上传/下载和 HarmonyOS App 全量动作。
- [ ] 旧 Bridge、长流、多标签和设备现场。

第 16、23D 继续保持“部分实现”；R93 只关闭公共日志 DTO 的源码安全子阶段。
