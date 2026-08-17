# R118 Voice TTS playback generation gate

更新时间：2026-08-10

## 范围

Voice App 已有远程 request/client correlation 和 media facade cleanup，但 TTS 初始化 Promise 仍可能在页面离开或 host 切换后完成，并启动旧的本地/远程播放；已开始的远程播放完成回调也可能清除新一轮播放状态。本阶段补齐 App 侧的 generation、hostProfileId 和 connectionEpoch 生命周期门。

## 实现

- 新增 `AgentHomeVoicePlaybackCoordinator`，每次 TTS 开始、用户中断、页面消失、host quiesce 和 runtime reset 都推进 generation。
- `initializeSpeech()` 的成功/失败回调只有在 generation、hostProfileId 和 connectionEpoch 全部匹配时，才能选择 device TTS 或发起 remote TTS。
- 本地 `speak()` 和远程 `playAudioBase64()` 的异步完成/异常回调复用同一 scope gate，旧回调不会清除新播放状态。
- 无效 generation 的远程 TTS response 在 App parser 状态入口直接丢弃；不改变 Bridge 的既有 clientRequestId、request identity 和取消语义。
- 新增纯逻辑 Hypium 测试，覆盖 host/epoch mismatch、user interrupt、第二次播放替换和生命周期 reset；注册到 `List.test.ets`。

## 本次验证

| 验证 | 结果 |
|---|---|
| SDK 23 `assembleHap --no-daemon --stacktrace` | 通过；`BUILD SUCCESSFUL in 47 s 419 ms` |
| HAP SHA-256 | `6B719D681B063879AF7F6096D6FE98BA279426F57AE7453E8FDB68366FA3C2D3` |
| Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` | 通过（R117 postcheck 也通过） |
| `git diff --check` | 通过；仅有既有换行格式提示 |

本阶段修改 ArkTS 页面、Voice coordinator、Hypium 测试和文档；未安装、启动、读取日志或测试设备。指定设备 `5KLBB25A10203862` 未被操作。

## 边界

真机录音权限、AudioKit 路由、耳机/蓝牙、来电抢占、前后台和弱网长录音，以及真实 STT/TTS Provider 仍属于第 21、33 的现场验收门；本阶段不改变条目“部分实现”状态。
