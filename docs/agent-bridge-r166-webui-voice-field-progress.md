# R166：Web 工作台完整交互 + Voice capability 门禁验证

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4）

## 1. Web UI 工作台完整交互（第 23B 项）

真实 Chrome 中已登录 Web UI（Connected），快照显示完整工作台：
- **Host 区**：`0.1.4 · srv_je-yNHB204xxnUNs` + compatibility 状态（unknown, remediation 提示）。
- **Agents 区**：5 个 mock agent + New 按钮。
- **Workspaces 区**：`Coder · active`（F:\DevEcoStudioProject\Coder）+ Open/Archive 按钮。
- **composer**：`textbox "Send a message"` + Send 按钮。

**消息发送闭环**：type `hello from webui field test` → click Send → 消息渲染到会话（`StaticText "hello from webui field test"`）—— composer → message.send → 渲染 全链真实浏览器验证。

## 2. Voice capability 门禁（第 21/33 项）

WebSocket + HTTP 双通道验证（均 1ms）：
- `voice.status`：available=false；8 项 capability 全 false（audioCapture/audioPlayback/speechToText/textToSpeech/remoteSpeechToText/remoteTextToSpeech/voiceActivityEvents/interruptionHandling）；streamingUpload=true；privacy=not_applicable/dataForwarded=false；limits（maxChunkBytes=262144/maxSessionBytes=10485760/maxTtsTextLength=8000/timeoutMs=30000）。
- `voice.tts.speak`：`capability_unavailable` + `Configure AGENT_BRIDGE_VOICE_TTS_URL with an HTTPS Provider endpoint`（R14/R90 fail-closed）。
- `voice.session.start`：`capability_unavailable` + STT URL remediation。
- HTTP /rpc 通道延迟 10-50ms 正常；一次 11 秒延迟复测不现（瞬时负载）。

## 3. 验证脚本

- `check-r166-voice-timing.js`：WebSocket voice.status/tts.speak/session.start 计时（1ms fail-closed）。
- `check-r164b-usage-events-same-ws.js`：usage.updated 事件推送（上一轮）。

## 仍待 FIELD

- 真机音频路由（设备深度锁屏，需用户指纹解锁）。
- 真实 Codex App Server（第三方 provider 认证）。
- Web UI 多标签长流、Settings 面板深交互。
