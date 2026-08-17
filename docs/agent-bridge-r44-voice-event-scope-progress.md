# Agent Bridge R44 Voice Event Scope

更新时间：2026-08-09

## 目标

收口 Bridge Voice 生命周期事件的连接隔离边界。Voice session/TTS 请求已经记录 owner，但事件回调此前使用全局广播，可能让其他 WebSocket 连接收到 transcript、VAD、TTS 状态或音频结果。本阶段只处理 Bridge 事件投递安全，不宣称完成真实 Provider 或 HarmonyOS 音频现场。

## 实现

- [x] `VoiceManager.emit()` 接收 owner id，并为 session、transcript、VAD、TTS 和过期事件携带仅供 Bridge 内部路由的 owner metadata。
- [x] 新增 `voice-event-router.js`，只将事件投递到 connectionId 与 owner id 完全匹配的 WebSocket 连接；缺少 owner 时不投递。
- [x] `server.js` 在发送前移除内部 owner 字段，禁止 Voice 事件继续使用 `broadcastToClients()`，公开 payload 不包含连接标识。
- [x] TTS start/ready/failed/cancelled、STT partial/final/failed、chunk/VAD、session started/transcribing/cancelled/expired 均走同一 owner-scoped 路由。
- [x] 新增 `check-voice-event-scope-smoke.js`，覆盖 owner metadata、双连接单播、空 owner 阻断和 server 静态接线；脚本已加入 Bridge 全量 `check`。

## 验证

- [x] `node --check src/voice-manager.js`、`node --check src/voice-event-router.js` 和 smoke 脚本：退出码 0。
- [x] `node scripts/check-voice-event-scope-smoke.js`：输出 `voice event scope smoke ok`。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0；precheck、Bridge 全量 Node/CLI/MCP/Provider/daemon/Web/Voice postcheck 均通过。
- [x] `git diff --check`：无新增阻断问题。
- [x] 本阶段仅修改 Node Bridge 和文档，未生成或安装 HAP，未启动或测试设备。

## 边界

- [ ] 真实 Provider STT/TTS 长会话、迟到结果、弱网、重试和取消语义仍需现场验证。
- [ ] HarmonyOS 真机权限撤销、音频焦点、耳机/蓝牙、来电抢占、前后台和实际音频路由仍需现场验证。
- [ ] 第 21、33 项继续保持“部分实现”；自动化通过不替代真实音频现场。

