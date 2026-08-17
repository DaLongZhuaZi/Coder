# Agent Bridge R50 Automation Runtime Event Scope

更新时间：2026-08-09

## 目标

收口 Schedules、Loops 与 Chat Rooms 运行期间创建的 Agent/session Provider 事件。R47 已限制 schedule/loop/room lifecycle event，但内部 `automationConnection` 的 Agent 生命周期、session 创建和 Provider message/tool 事件仍经 `sendAutomationClientMessage` 全局发送。本阶段只处理 runtime event 投递边界，不改变自动化执行、Provider 调用、预算、验证器或 room fan-out 语义。

## 实现

- [x] `automation-event-router.js` 增加 runtime event workspace 解析：优先读取事件 payload/session/agent workspace，缺失时通过 agentId/sessionId 解析当前 Agent。
- [x] `sendScopedAutomationRuntimeEvent()` 只向当前连接已通过成功 automation RPC 确认对应 workspace 的订阅者发送；无 scope 或无法解析 workspace 的事件默认丢弃。
- [x] server `sendAutomationClientMessage()` 不再遍历所有 WebSocket；automationConnection 的 Agent/session/message/tool/permission 等 runtime event 统一经过 scoped router。
- [x] R47 的实体/workspace subscription 仍是唯一授权来源；连接断开清除 state，重连必须重新 list/get/history 或执行写操作建立订阅。
- [x] 新增 `check-automation-runtime-event-scope-smoke.js`，覆盖 agent/session workspace 解析、双 workspace 隔离、未知 scope 丢弃和 server 静态接线；加入 `postcheck` 的 `check:automation-runtime-event-scope`。

## 验证

- [x] Node 语法检查、automation runtime event scope smoke、R47 automation scope smoke、Schedule/Loop/Chat Room manager smoke 均退出码 0。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；包含 R50 postcheck。
- [x] `git diff --check`：退出码 0；仅报告既有 LF/CRLF 转换提示，无 whitespace error。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实 Schedule/Loop/Chat Room 长时间 Provider 会话、多个 App workspace 订阅、daemon 重启恢复和权限变化仍需 FIELD 验收。
