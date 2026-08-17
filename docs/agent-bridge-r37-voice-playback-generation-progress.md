# Agent Bridge R37 Voice Playback Generation Progress

## Scope

本阶段只收口 Voice 远程 TTS 播放器的迟到状态回调隔离，不把真机音频路由、系统中断、蓝牙和真实 Provider 服务现场验收误记为源码完成。

## Implementation

- `VoicePlatformFacade` 为每个远程 `AVPlayer` 捕获当前 `remotePlaybackGeneration` 与 player identity。
- `stateChange` 回调在进入完成/错误处理前同时校验 generation 和 player identity；旧播放器的迟到事件不会结束或污染新一轮播放。
- 当前 player 的 state callback 保存到 facade 字段，释放时使用同一 callback 调用 `off`，随后清空引用和音频缓冲。
- stop/release 路径推进 playback generation，使已释放播放器的回调立即失效。
- 保留既有远程音频 MIME、采样率、声道、AudioSession 和内存清理约束。

## Verification

本轮实际执行：

- `node --check tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js`：退出码 0。
- `node tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js`：退出码 0，输出 `voice platform contract smoke ok`。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0，包含 `check:voice-platform` 及全部既有 postcheck。
- `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 40 s 144 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,246,132 bytes，SHA-256 `F378C3863E3CA8DF22CF9DF1073E54F1DAFFB3EEB8B62AD0CC39CD20EDA4143D`。
- `git diff --check`：退出码 0；仅报告既有换行转换提示。

本轮没有安装、启动或测试设备，也没有操作除 `5KLBB25A10203862` 之外的任何设备。

## Boundary

第 21、33 项继续保持“部分实现”。真实设备首次授权、权限撤销、耳机/蓝牙切换、来电抢占、前后台与锁屏、弱网/长录音以及真实 STT/TTS Provider 仍需 FIELD 验收。
