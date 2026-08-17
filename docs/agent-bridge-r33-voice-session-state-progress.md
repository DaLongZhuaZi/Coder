# R33 Voice session state and interruption progress

更新时间：2026-08-09

## 目标

在已有 Voice endpoint、远程采集隔离、字段校验和 AudioCapturer 生命周期基础上，收口本地语音平台的权限、前后台、音频会话焦点和重复清理语义。该阶段只关闭可由源码和自动化证明的子阶段，不把真机路由或真实 Provider 结果冒充为已验收。

## 已完成

- [x] `VoicePlatformFacade` 在后台拒绝新的录音请求，并以 `app_background` 稳定失败类别返回；回到前台后清理该临时状态。
- [x] 麦克风权限先检查再请求，能力快照公开 `microphonePermission` 和受控 `permissionRemediation`；拒绝时不泄露平台内部信息，并引导到系统权限设置。
- [x] 能力快照公开 `audioSessionState`，区分 `inactive`、`active` 和 `interrupted`。
- [x] 主动 `deactivateAudioSession()` 与系统 `audioSessionDeactivated` 事件通过期望事件计数区分，避免主动释放被误报为系统中断。
- [x] 系统中断清理增加活动音频检查和 in-flight guard；录音、TTS、远程 Renderer/AVPlayer 的重复 cleanup 不再重复发布虚假的 interruption 状态。
- [x] 新增 `NGFVoicePermissionState`、`NGFVoiceAudioSessionState` 和 `NGFVoiceFailureCategory.APP_BACKGROUND`，并从 `ngf_framework` media 公共入口导出。
- [x] Voice contract smoke 增加后台拒绝、权限门、稳定 remediation、音频会话状态和中断幂等源码断言；App 纯逻辑测试覆盖默认状态与权限 remediation 字段。

## 本轮实际验证

- `node --check scripts/check-voice-platform-contract-smoke.js`：退出码 0。
- `node scripts/check-voice-platform-contract-smoke.js`：退出码 0，输出 `voice platform contract smoke ok`。
- `npm run check`（`tools/agent-bridge`）：退出码 0，包含 `check:voice-platform`、R12/R13/R26/R27/R28/R29/R30/R32 postcheck。
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 54 s 518 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,227,797 bytes，SHA-256 `FC5C1C4EAA590468287463AE444863516CEEA35831322A15113599CD186E7837`。
- `hdc list targets -v`：指定 target `5KLBB25A10203862` 为 `USB Connected`。
- 仅执行 `hdc -t 5KLBB25A10203862 install -r <HAP>`：安装失败，HDC `9568423`，签名 profile 未授权该设备 UDID；未启动、未截图、未读取设备日志、未执行设备测试，也未向其他设备安装。
- `git diff --check`：退出码 0；仅保留既有 LF/CRLF 提示。

## 仍待现场

- 真机首次授权、系统设置撤销/永久拒绝、隐私指示和权限恢复。
- 耳机/蓝牙切换、来电或其他应用抢占、锁屏、前后台切换、长录音和真实 AudioInterrupt 路由。
- 真实 STT/TTS Provider 的弱网、超时、长会话、撤销和音频格式兼容。

## 证据边界

R33 只证明 Voice platform 源码的状态与清理语义；第 21、33 项继续保持“部分实现”，直到现场音频路由和真实 Provider 验收完成。
