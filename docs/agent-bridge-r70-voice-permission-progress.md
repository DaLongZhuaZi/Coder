# R70 Voice 权限语义收口进度

更新时间：2026-08-09

## 范围

本阶段收口第 21、33 项中的麦克风权限状态和 remediation 语义。真实设备权限、音频路由、蓝牙/耳机、来电抢占、前后台、弱网长录音和真实 Provider 仍属于 FIELD 验收，不在源码阶段宣称完成。

## 已完成

- `ngf_framework/src/main/ets/media/contracts/IVoicePlatform.ets` 新增 `NGFVoicePermissionRemediation`，并从 media contracts/index 和 media/index 导出。
- `VoicePlatformFacade.ensureMicrophonePermission()` 在授权成功时清理 remediation、failure category 和 message；拒绝时固定设置 `microphonePermission=denied`、`failureCategory=permission_denied`、`permissionRemediation=open_app_permission_settings`。
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets` 使用共享权限常量；Voice composer 在拒绝状态下展示受控本地化 remediation，不暴露系统路径。
- `agent_home_voice_permission_remediation` 已通过 `scripts/i18n_updater.py` 写入 base/en_US/zh_CN 资源。
- `AgentBridgeVoiceParser.test.ets` 和 `check-voice-platform-contract-smoke.js` 覆盖共享常量与页面资源接线。

## 本次验证

- `node --check scripts/check-voice-platform-contract-smoke.js && node scripts/check-voice-platform-contract-smoke.js`：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0。
- `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 36 s 852 ms`。
- 资源 JSON 校验、`git diff --check`：通过。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,380,892 bytes，SHA-256 `34D84AFBC3B17E6AB70F9BEFFED9D2663E9B9494E652AD2BB5E9161DF85A90C5`。
- HDC 目标列表：`5KLBB25A10203862` 为 `Offline`，因此未执行安装；未启动、未测试、未读取日志，在线的其他 target 未使用。

## 后续现场门

- 真机授权拒绝/恢复和系统设置跳转。
- 蓝牙、耳机、来电音频焦点与前后台切换。
- 弱网长录音、真实 STT/TTS Provider 和资源清理。
