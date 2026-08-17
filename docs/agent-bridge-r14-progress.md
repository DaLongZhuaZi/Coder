# R14 Voice endpoint 与 capability 契约收口

更新时间：2026-08-08

## 目标

依据对齐清单第 21、33 项的当前事实，收口 Bridge Voice 的安全配置和 capability 语义。本阶段只处理可由源码与自动化证明的边界，不把真实 Provider、HarmonyOS 真机音频路由、蓝牙、来电抢占或长录音现场写成已完成。

## 已完成

- [x] `VoiceManager` 对环境变量和显式进程配置统一执行 HTTPS、无用户名/密码/fragment 校验；非法端点不启用对应远程能力。
- [x] `voice.status.warnings` 返回稳定的 `stt_endpoint_requires_https` / `tts_endpoint_requires_https` code，不回显端点 URL、token 或安全存储信息。
- [x] Bridge Voice 默认不宣告本机 `audioCapture`、`audioPlayback`、`voiceActivityEvents` 和 `interruptionHandling`；只有显式平台适配器配置才可开启，远程 STT/TTS 只按 HTTPS endpoint 发布。
- [x] App `AgentBridgeVoiceResult` 增加强类型 `warnings`，parser 对缺字段使用空数组，并保留独立 capability false 值。
- [x] Voice 定向 smoke 覆盖 HTTPS 拒绝、warning 脱敏、远程 capability 和默认本地音频能力 false。

## 本轮验证

本轮实际执行并通过：

```text
node --check tools/agent-bridge/src/voice-manager.js
node tools/agent-bridge/scripts/check-voice-manager-smoke.js
npm --prefix tools/agent-bridge run check
git diff --check -- tools/agent-bridge/src/voice-manager.js tools/agent-bridge/scripts/check-voice-manager-smoke.js docs/agent-bridge-voice.md tools/agent-bridge/README.md entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets entry/src/test/AgentBridgeVoiceParser.test.ets
```

`npm run check` 退出码为 0，包含既有 R12/R13 postcheck。SDK 23 `assembleHap --no-daemon --stacktrace` 本轮退出码为 0（`BUILD SUCCESSFUL`），仅保留既有 syscap、弃用和异常声明警告。随后仅向 `5KLBB25A10203862` 执行安装，因签名 profile 未授权 UDID 返回 HDC `9568423`；未启动或测试，也未操作其他设备。

## 仍待现场验收

- HarmonyOS 真机的麦克风权限撤销、前后台、音频焦点、来电、耳机/蓝牙和设备路由。
- 真实 HTTPS STT/TTS Provider 的 partial/final、MIME/采样率/声道、超时、弱网和播放失败。
- 长录音、音频清理和真实设备资源压力。

## 后续候选

继续审计第 22/34 的真实 quota/metadata 适配和第 23B/23D 的平台 host/App 控制面；现场依赖保持单独证据，不提前改清单状态。
