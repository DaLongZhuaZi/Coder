# R96 Voice 远程 PCM/raw 采样深度

更新时间：2026-08-09

## 目标

修复 Voice 远程 TTS/音频播放链路中 `sampleBits` 已由 Bridge 校验和 App parser 暴露，但没有传入 NGF media facade、始终按 16 位 S16LE 播放的问题。该阶段只收口协议到媒体层的源码边界，不把真机音频路由或真实 Provider 结果写成现场通过。

## 实现

- `IVoicePlatform.playAudioBase64()` 增加可选 `sampleBits`，旧调用保持兼容并默认 16。
- `NGFAgentHomePage` 将 `AgentBridgeVoiceResult.sampleBits` 转发到 media facade，缺字段安全回退 16。
- `VoicePlatformFacade` 对 8、16、24、32 位执行显式校验；PCM/raw 分别映射到 `SAMPLE_FORMAT_U8`、`SAMPLE_FORMAT_S16LE`、`SAMPLE_FORMAT_S24LE`、`SAMPLE_FORMAT_S32LE`，非法值返回稳定 TTS failure。
- Voice parser test 增加 24 位结果解析断言；platform contract smoke 增加 sample depth 校验、映射和 App 转发断言。

## 本次验证

- `npm run check:voice-platform`：通过，输出 `voice platform contract smoke ok`。
- `node --check src/voice-manager.js` 与 `node --check scripts/check-voice-platform-contract-smoke.js`：通过。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`（`tools/agent-bridge`）：退出码 0；Docker runtime smoke 按规则 skipped。
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；HAP 14,420,752 bytes，SHA-256 `9533179E1523A8C2B7F1119E2350BF7D63A34401828B018C2C707EBC45A0E275`。
- `git diff --check`：通过。

## 边界

没有连接、安装、启动或测试任何设备。设备 `5KLBB25A10203862` 的安装约束仍有效；真实 Provider 的 PCM profile、真机 AudioRenderer 路由、蓝牙/耳机、来电抢占、前后台和长录音继续作为第 21、33 项现场验收。
