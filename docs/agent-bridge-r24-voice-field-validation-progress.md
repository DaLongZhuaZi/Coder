# R24 Voice 字段与 Provider 输出校验

更新时间：2026-08-08

## 目标

在 R14、R18、R23 的 endpoint、远程采集隔离和生命周期收口基础上，继续收紧 Voice RPC 的输入与 Provider 返回边界。该阶段只关闭可由 Bridge smoke 证明的字段安全子阶段，不把真机音频路由或真实语音服务写成已完成。

## 已完成

- [x] 录音会话拒绝未知音频 MIME、非整数/越界采样率、超过两路声道和不支持的采样深度；不再静默夹断到边界值。
- [x] 语言字段限制为短 BCP-47 风格标签，文本、voiceId 和 transcript 清除控制字符并执行长度上限。
- [x] STT transcript/partial transcript 超限返回稳定 `voice_transcript_too_large`，正常缺失的 confidence/durationMs 保持字段缺失，不伪造 `-1` 或 `0`。
- [x] TTS 请求与返回均校验音频格式和 sample profile；支持既有 MIME 与常用短格式别名，未知返回格式不再回退为 `audio/mpeg`。
- [x] Provider 异常只返回稳定 failure category 和脱敏文案，不把原始异常、endpoint 或凭证内容写入 RPC/event。
- [x] 既有 Voice manager smoke 扩展覆盖非法字段、未知 TTS 格式、无效 profile、超长/异常 Provider 返回和错误文案脱敏。

## 本轮验证

```text
node --check tools/agent-bridge/src/voice-manager.js
node --check tools/agent-bridge/scripts/check-voice-manager-smoke.js
node tools/agent-bridge/scripts/check-voice-manager-smoke.js
```

以上定向命令均退出码 0。本轮另行执行 Bridge 全量 `npm run check`，退出码 0；SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，`entry/build/default/outputs/default/entry-default-signed.hap` 大小 14,195,619 bytes，SHA-256 为 `FCBCCACB88ECB9E50606D9E8FA424DBB7DBDACF6CF0DD496EA987D53F9C9EA08`。设备检查显示 `5KLBB25A10203862` 为 `Offline`，因此没有执行安装，也没有启动或测试应用；没有向其他设备安装。

## 尚未关闭的现场门

- 真机麦克风权限撤销、前后台、音频焦点、来电、耳机/蓝牙和输出设备路由。
- 真实 STT/TTS Provider 的 partial/final、格式协商、弱网、超时、取消、长录音和进程终止清理。

因此第 21、33 项仍保持“部分实现”；本阶段只关闭 Voice 字段校验源码子阶段。
