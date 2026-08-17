# R153 Voice TTS Single Playback

日期：2026-08-11  
状态：已完成（远程 TTS 双交付单次播放源码子阶段；第 21、33 项仍为部分实现）

## 目标

核查 Bridge 同时通过 `voice.tts.updated` 事件和 `voice.tts.speak` RPC response 返回同一段音频时，HarmonyOS App 是否会重复播放。实际实现此前会让两条兼容交付路径分别调用媒体 facade，因此同一 TTS 结果可能播放两次。

## 已实现

- `AgentHomeVoicePlaybackCoordinator` 增加非空 `deliveryIdentity` 和单 generation 消费门；同一 hostProfileId、connectionEpoch、generation 只接受首次音频交付。
- App 依次使用 `clientRequestId`、`ttsRequestId`、RPC envelope request id 解析播放身份；空身份 fail closed。
- 去重门位于 Voice UI 状态写入和 `ngfVoicePlatformFacade.playAudioBase64()` 之前，重复事件或响应不会污染播放状态，也不会再次调用平台播放层。
- 事件和 response 两条协议路径继续保留，未删除或收窄旧客户端字段。
- begin、reset、invalidate、complete 均清理已消费身份；新 generation 可以正常接受下一轮播放。
- Hypium 纯逻辑测试覆盖空身份、重复交付、错误 host/epoch 和新 generation；`check:r153` 已加入 Bridge `postcheck`。

## 自动化证据

本轮实际通过：

```text
npm run check:r153
npm run check:r121
npm run check:r130
npm run check:voice-platform
node scripts/check-voice-event-scope-smoke.js
node scripts/check-protocol-alignment-smoke.js
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
git diff --check
```

Bridge 全量检查退出码为 `0`，`postcheck` 实际执行并通过 `check:r153`；Docker runtime smoke 按 opt-in 规则跳过。SDK 23 构建为 `BUILD SUCCESSFUL in 36 s 312 ms`，产物 `entry/build/default/outputs/default/entry-default-signed.hap` 大小 `14,542,721` bytes，SHA-256 `4E04B5F61A58D9777A558B0334A74479EACB2715393622AA430E22FD94E4D29E`。仅保留既有 syscap、异常处理和废弃 API 警告。

## 未关闭的门

- 压缩音频 AVPlayer 必须按 SDK 23 的 idle -> initialized -> prepared -> playing 状态机启动，并在设置 data source 前注册 state/error listener；该源码缺口进入后续 R155。
- 真实 STT/TTS Provider、音频格式、弱网、权限、蓝牙/耳机、来电、前后台和长会话仍需现场验收。
- 本轮未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。

因此，第 21、33 项继续保持“部分实现”。
