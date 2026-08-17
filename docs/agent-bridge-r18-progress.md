# R18 Voice 远程采集隔离

更新时间：2026-08-08

## 目标

修复 HarmonyOS Voice 在远程 STT 路径下仍可能触碰本地 CoreSpeechKit 识别引擎的问题。App 会先初始化本地语音能力以探测设备能力；当最终选择 `remote_stt` 时，Bridge 上传链路必须独占采集数据，本地识别引擎不得接收音频，也不得被 finish/cancel 调用。

## 已完成

- [x] `VoicePlatformFacade` 的 `finishRecording()` 和 `cancelRecording()` 仅在 `captureMode === 'device_stt'` 时调用本地识别引擎。
- [x] `dispatchAudioChunk()` 仅在 `device_stt` 模式向 CoreSpeechKit 写入音频；`remote_stt` 只通过 listener 发送 Bridge chunk。
- [x] `release()` 无论最后一次采集模式为何，都释放已初始化的 recognition engine，避免远程路径留下本地引擎资源。
- [x] 新增 `check-voice-platform-contract-smoke.js`，把远程路径隔离门控纳入 Bridge `postcheck` 和全量 `check`。

## 本轮验证

实际执行并通过：

```text
node --check tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js
node tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js
node tools/agent-bridge/scripts/check-voice-manager-smoke.js
npm --prefix tools/agent-bridge run check
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

结果：Bridge 全量 check 退出码 0；SDK 23 HAP `BUILD SUCCESSFUL in 39 s 896 ms`。构建只保留既有 syscap、API 弃用和异常处理警告。

随后只对指定设备 `5KLBB25A10203862` 执行安装：

```text
hdc -t 5KLBB25A10203862 install -r entry/build/default/outputs/default/entry-default-signed.hap
```

结果：安装返回 HDC `9568423`，当前签名 profile 未授权该设备 UDID；未启动应用、未执行设备测试、未向其他设备安装。

## 仍待现场验收

- 真机麦克风权限撤销、前后台、音频焦点、来电、耳机/蓝牙和设备路由。
- 真实 STT/TTS Provider 的 partial/final、采样参数、超时、弱网、长录音和播放失败。

本轮不修改第 21、33 项对齐状态；源码缺口已收口，现场依赖继续由 FIELD 轨道管理。
