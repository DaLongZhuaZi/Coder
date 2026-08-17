# R121 Voice TTS 请求与播放生命周期进度

更新时间：2026-08-10

## 本轮范围

本轮收口 Voice App 的一个可复现状态缺口：远程 TTS Provider 尚未返回音频时，页面此前只依据本地 `SPEAKING` 状态决定停止操作；远程音频正常播放结束后，页面的 `voiceTtsMode` 也可能残留。

## 实施内容

- `AgentHomeVoicePlaybackCoordinator` 增加 `playbackStarted` 状态、`markPlaybackStarted()` 和受 scope/generation 校验的 `complete()`。
- Agent Home 统一使用 `isVoiceSpeechActive()`，远程 TTS 请求等待期间也能通过同一按钮取消，并继续按 `clientRequestId`/Bridge request id 停止对应请求。
- NGF media snapshot 在远程播放器/renderer 清理完成后回到 idle/error/interrupted 且没有 `ttsRequestId` 时，页面完成当前 generation 并清理活动 TTS 状态。
- host quiesce、失败、停止和页面生命周期继续清理活动 TTS 标识；旧 generation 的迟到结果仍被丢弃。
- 新增 Hypium 纯逻辑边界测试和 `check:r121` 静态契约 smoke，并接入 Bridge `postcheck`。

## 当前验证

- `npm run check:r121`：已通过。
- `node --check scripts/check-voice-tts-lifecycle-smoke.js`：已通过。
- `package.json` JSON 解析：已通过。
- `git diff --check`：无实际空白错误。
- `npm run check:voice-platform`、Voice manager/event/protocol smoke：已通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0，新增 `check:r121` 已由 postcheck 实际执行并通过；Docker runtime 仍按既有 opt-in 规则跳过。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`entry-default-signed.hap` 大小 `14,492,702` bytes，SHA-256 `3828FFC55FE364A4B1575AFD1744F6E753A9702FC37693D15F14FEE21F7987FC`；仅保留既有 syscap、弃用 API 和异常处理警告。
- 本轮未安装、启动或测试设备；若后续需要安装，遵守只向 `5KLBB25A10203862` 安装且不启动、不测试的约束。

## 对齐结论

R121 只证明 Voice 请求等待、播放完成和页面状态清理的源码子阶段，不关闭清单第 21、33 项。真机权限/路由、耳机与蓝牙、来电抢占、弱网、长录音和真实 Provider 仍是现场验收门。
