# R159 Web Browser Permission 状态展示

日期：2026-08-15
状态：已完成（第 23B、23D 项 Web Browser permission 状态可见闭环源码子阶段；条目仍为部分实现）

## 目标

审计发现 Web 工作台只有 `browser.permission.set`（添加 allowlist 域），没有消费 `browser.permission.get` 的状态展示；HarmonyOS App 端（R69）已展示 allowlist、下载目录状态和更新时间。补齐 Web 端最小闭环，复用同一 Bridge RPC 与公开 DTO，不建设平行后端。

## 已实现

### Web UI（`src/web/index.html`、`src/web/app.js`）

- `index.html` Browser Automation 区在 `Update Permission` 按钮后新增 `browser-permission-status` 状态区（`role=status`）。
- `app.js` 新增 `renderBrowserPermission(permission)`：只使用公开 DTO 的 `domains`（allowlist）、`downloadDirectoryConfigured`、`updatedAt`，用 `text()` 渲染，不拼接 HTML；无敏感字段（R69 已脱敏）。
- `app.js` 新增 `refreshBrowserPermission(isCurrent)`：`browser.permission.get`（workspace scope），通过 `refreshBrowser()` 注入的 `refreshIsCurrent`（refreshToken + connectionGeneration + socket OPEN + pageClosing + workspace）校验迟到结果；旧 Bridge 缺 RPC 或失败时静默渲染空状态（fail-closed 不清除已展示的权威状态之外的内容）。
- `refreshBrowser()` 接入：feature/workspace 不可见分支清空状态；hosts 渲染后并行刷新 permission 状态，失败不阻断 hosts/instances/pages 主流程。

### smoke

- `check-web-ui-contract-smoke.js` 新增断言：`script.includes('browser.permission.get')`（Web 必须读取 permission 状态）、`html.includes('browser-permission-status')`（Web 必须包含状态区）。

## 自动化证据

- `node --check src/web/app.js` 与 Web 相关 smoke 脚本语法：退出码 0。
- `npm --prefix tools/agent-bridge run check:r13`、`check:r88`、`check:r116`：退出码 0（web UI contract smoke 实际执行并通过新断言）。
- Bridge 全量 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`：退出码 0（含 precheck/check/postcheck 全部 smoke，postcheck 实际执行并通过 `check:r155`），Docker runtime 按 opt-in 规则跳过。
- `git diff --check`：退出码 0。

## 未关闭的门

- 真实 platform Browser host、恶意页面/登录态、多标签长流、真实上传下载和 HarmonyOS App 全量动作仍为第 16、23B、23D 项 FIELD 验收。
- 本轮未修改 ArkTS/HAP、未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。

因此，第 23B、23D 项继续保持“部分实现”。
