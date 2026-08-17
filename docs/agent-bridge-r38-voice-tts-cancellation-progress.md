# Agent Bridge R38 Voice TTS Cancellation Progress

## Scope

本阶段只收口 Bridge VoiceManager 远程 TTS 的取消竞态，不把真实 Provider 的取消语义、网络中断或真机播放现场验收误记为源码完成。

## Implementation

- TTS 请求记录增加 `cancelled` 状态，并保留请求对象 identity。
- `stop`、owner detach 和 manager shutdown 在 abort 前标记请求取消；迟到 Provider 响应不会重新变成可播放结果。
- Provider response 解析后、发布 `tts.ready` 前均重新校验请求仍是当前请求、未取消且 signal 未 abort。
- 取消或请求已从 manager 清理时，结果统一返回 `voice_cancelled`，不发布 `tts.ready`。
- 原有 owner 隔离、AbortSignal、错误脱敏和请求 finally 清理保持不变。

## Verification

本轮实际执行：

- `node --check tools/agent-bridge/src/voice-manager.js`：退出码 0。
- `node --check tools/agent-bridge/scripts/check-voice-manager-smoke.js`：退出码 0。
- `node tools/agent-bridge/scripts/check-voice-manager-smoke.js`：退出码 0，包含 Provider 忽略 abort 后的迟到响应测试。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0，包含全量 Bridge 与 postcheck。
- 本轮未修改 ArkTS，未执行 SDK 23 HAP 构建；未安装、启动或测试设备。

## Boundary

第 21、33 项继续保持“部分实现”。真实 Provider 取消/超时、弱网、音频路由、蓝牙/来电和长录音仍需 FIELD 验收。
