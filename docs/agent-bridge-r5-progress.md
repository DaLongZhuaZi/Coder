# Agent Bridge R5 Voice 进度

## 目标

收口清单第 21、33 项的本地/远程 Voice 能力：独立 capability、单一 STT/TTS Provider 选择、远程 TTS 播放、取消/中断/后台清理，以及协议、App、NGF media 和 Bridge 的自动化回归。

## 源码进度

- [x] Bridge `voice.status` 发布 audio capture/playback、device/remote STT/TTS、VAD 事件和 interruption capability；Voice 结果携带 mode/provider，并对远程音频大小、MIME、base64 和会话生命周期做校验。
- [x] App 在本地 STT 可用时不创建 Bridge Voice session；本地不可用且远程 capability 可用时才上传音频；本地和远程 TTS 只选择一路。
- [x] NGF media voice facade 集中处理 AudioCapturer、AudioRenderer/AVPlayer、AudioSession、前后台、中断、停止、释放和内存音频清理；页面不直接持有平台音频对象。
- [x] Bridge TTS 的 `audioBase64`、MIME、采样率、声道和采样位宽通过 App parser 进入 NGF 播放层；播放失败返回稳定错误并清理资源。
- [x] `IVoicePlatform.startRecording` 支持可选 capture mode，SDK 23 ArkTS 编译通过。

## 本次真实验证

执行日期：2026-08-08，工作区 `F:\DevEcoStudioProject\Coder`。

| 验证 | 结果 |
|---|---|
| `node --check tools/agent-bridge/src/voice-manager.js` | 通过 |
| `node --check tools/agent-bridge/src/server.js` | 通过 |
| `node tools/agent-bridge/scripts/check-voice-manager-smoke.js` | `voice manager smoke ok` |
| `node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js` | `protocol alignment smoke ok` |
| `npm run check`（`tools/agent-bridge`） | 通过，含 Voice、协议、CLI/MCP、GitHub、Relay、Daemon、Schedules/Loops/Rooms 全量 smoke |
| `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace` | `BUILD SUCCESSFUL`，仅既有 syscap/异常处理提示及 `AudioRenderer.write` 弃用提示 |

## 当前状态与剩余验收

R5 的源码协议、Bridge、NGF media、App 接线和自动化已完成。第 21、33 项暂保持“部分实现”，因为尚未在真实 HarmonyOS 设备和真实语音 Provider 上完成麦克风权限撤销、噪声/长录音、耳机/蓝牙路由、来电或其他音频抢占、前后台切换、弱网和真实 TTS 输出验收。

现场验收必须确认：本地语音在没有 Bridge 外部 endpoint 时可独立工作；远程 TTS 只播放一次；中断、取消、页面退出和进程结束后不残留音频数据或播放资源。现场失败只重新打开对应平台或 Provider 缺陷，不回退已通过的源码 smoke。
