# R23 Voice 采集生命周期收口

更新时间：2026-08-08

## 目标

继续收口对齐清单第 21、33 项的源码边界，避免旧 AudioCapturer 回调或音频会话监听器在页面/会话释放后污染新的 Voice 会话。该阶段只处理可由源码和自动化证明的生命周期安全，不把真机音频路由或真实语音 Provider 现场写成已完成。

## 已完成

- [x] 每次录音为 `AudioCapturer` 分配独立 capture generation 和 callback，迟到的旧 generation 或旧 capturer 回调在进入 PCM 分帧前丢弃。
- [x] 采集释放保存并清除当前 callback，使用同一 callback 调用 `AudioCapturer.off('readData', ...)`，避免共享 listener 残留。
- [x] `AudioSessionManager` 使用稳定的 `audioSessionDeactivated` callback，并在 facade release 时成对调用 `off`，不让页面销毁后继续触发中断处理。
- [x] 保持 remote STT 不写入/结束本地 CoreSpeechKit，release 仍清理已初始化的本地 recognition engine。
- [x] App 将录音入口与播放入口分开 gate；仅远程 TTS 可用时不会显示为可录音能力，播放仍可独立使用。

## 本轮实际验证

```text
node --check tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js
node tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js
npm run check
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

其中 `npm run check` 的工作目录为 `tools/agent-bridge`。以上命令本轮均退出码 0。HAP 为
`entry/build/default/outputs/default/entry-default-signed.hap`，SHA-256
`AE38D19A6ECB354EFA49CE4F99E20B2F56A20622B636CF2B852A60F0AA52446C`，大小
14,197,321 bytes。构建只保留既有设备能力、弃用 API 和异常处理警告。

设备安装按用户限制执行前检查 `hdc list targets -v`，指定设备
`5KLBB25A10203862` 当前为 `Offline`，因此本轮没有执行安装，也没有向其他设备安装，
未启动应用或执行设备测试。

## 尚未关闭的现场门

- 真机权限撤销、前后台、音频焦点、来电、耳机/蓝牙和输出设备路由。
- 真实 STT/TTS Provider 的 partial/final、格式协商、超时、弱网、播放失败和长录音。
- 进程终止/设备重启后的音频资源清理与不同 SDK 23 设备型号兼容。

因此第 21、33 项继续保持“部分实现”；本阶段只关闭 Voice 采集生命周期源码子阶段。
