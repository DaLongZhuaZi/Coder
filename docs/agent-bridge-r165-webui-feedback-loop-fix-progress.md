# R165：Web UI 反馈循环缺陷修复 + 真实浏览器工作台验证（第 23B 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4）

## 缺陷：Web UI session.messages 反馈循环

**现象**：Web UI 登录后 Bridge 每秒处理几十条 `session.messages` 查询（requestId `web_1786827242322_13374` 等毫秒级递增），health 响应 8-15 秒超时，设备连接反复断开。

**根因链**：
1. Bridge `session.messages` 查询处理（server.js 5739-5740）：响应后**无条件广播 SESSION_MESSAGES 事件**。
2. Web UI 事件处理器（app.js 1044）：收到 `session.messages` 事件 → `refreshSession()` → 再次查询 `session.messages`。
3. 每次查询产生事件、每个事件触发查询 → **事件→查询→事件反馈循环**，指数级放大。

## 修复（tools/agent-bridge/src/web/app.js）

1. **切断循环**：`session.messages` 事件不再触发 `refreshSession()`（其响应已含完整消息列表，重查无意义）。
2. **加节流保护**：`refreshSession()` 增加 `sessionRefreshInFlight` 去重（与 `refreshAll()` 的 `refreshInFlight` 同模式），并发事件只执行一次。

## 验证（真实 Chrome）

- 真实 Chrome 打开 `http://127.0.0.1:8788/`：完整登录（fill URL/token → click Connect）→ **工作台渲染**：`Connected` 状态 + Host/Agents/Workspaces 区 + mock session `Mock: F:\DevEcoStudioProject\Coder / idle`。
- 修复后 Bridge 日志：`session.messages.loaded` 从每秒几十条降为 **0 条**；health 恢复 16ms；连接稳定。
- 仅剩每 ~30 秒一次对已消失 session 的单次无害查询（attach 兼容设计，不形成风暴）。
- Web UI contract/live/multitab/session-experience/rich-content smoke 全部退出码 0。

## 关联脚本

- `check-r164b-usage-events-same-ws.js`：usage.updated 事件实时推送（6 条/消息：actual/estimated/compaction），host 隔离验证。
- `webui-open.py` / `webui-login-fixed.py`（.local-rules）：真实 Chrome Web UI 登录与工作台快照。

## 仍待 FIELD

- 设备端（深度锁屏待用户解锁）：mock provider 连接、App 面板现场。
- 真实 Codex App Server（第三方 provider 认证）。
- 多标签 Web UI 长流、真实 Provider quota。
