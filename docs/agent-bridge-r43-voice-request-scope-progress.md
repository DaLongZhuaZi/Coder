# Agent Bridge R43 Voice Request Scope

更新时间：2026-08-09

## 目标

收口 HarmonyOS App 远程 STT 的请求与会话边界。已有 TTS client/request id 关联和 NGF 音频生命周期不重复实现；本阶段只防止同一连接内的迟到 start/finish/cancel 响应、旧 session transcript/VAD 事件以及 host/epoch 切换后的结果覆盖当前 Voice UI。

## 实现

- [x] 新增 `AgentHomeVoiceRequestCoordinator`，维护 hostProfileId、connectionEpoch、操作代际、start/finish/cancel request id、远程 session id 和取消状态。
- [x] 远程 STT start 在用户取消或 host 切换后失效；没有匹配请求时不创建本地录音。
- [x] finish/cancel 响应按 pending request id 和当前 Bridge session id 校验；旧 session 的 transcript、VAD、chunk 和 session update 被丢弃。
- [x] 远程 STT 失败、完成、取消、页面退出和 host 清理统一消费 coordinator 状态；TTS 继续使用既有 clientRequestId 过滤路径。
- [x] `List.test.ets` 注册纯逻辑测试，覆盖 start 绑定、取消后的迟到 start、跨 session 事件、错误 finish request、host epoch 和完成清理。
- [x] protocol alignment smoke 增加 coordinator 与 Agent Home 接线断言。

## 验证

- [x] `node --check tools/agent-bridge/scripts/check-protocol-alignment-smoke.js`：退出码 0。
- [x] `node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js`：输出 `protocol alignment smoke ok`。
- [x] `node --check tools/agent-bridge/src/server.js`、`src/voice-manager.js` 和 Voice contract smoke 脚本：退出码 0。
- [x] `git diff --check`：无新增阻断问题，仅有工作区既有 CRLF 转换提示。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；包含 protocol alignment、Voice、Usage、Web、Browser、CLI/MCP、daemon 和 postcheck 全量 smoke。
- [x] SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 36 s 230 ms`；HAP `entry/build/default/outputs/default/entry-default-signed.hap`，14,297,965 bytes，SHA-256 `B341D347DC7C00507D02B9E371A45B4A755C9825DBF634AFA4AFABDA147A4F5B`。仅保留既有 syscap、弃用 API 和异常处理警告。
- [x] `git diff --check`：无新增阻断问题，仅有工作区既有 CRLF 转换提示。
- [ ] 设备安装：本阶段未执行；若后续安装，只允许向 `5KLBB25A10203862` 安装，不启动或测试。

## 边界

- 本阶段不宣称完成第 21、33 项的真实音频现场门；真机权限撤销、耳机/蓝牙、来电抢占、弱网长录音、真实 STT/TTS Provider 和音频路由仍需现场验收。
- 不修改 Bridge Voice endpoint、Provider 或 HarmonyOS AudioKit/CoreSpeechKit 能力声明，不伪造平台 Browser host 或 Voice VAD。
- 若安装 HAP，只允许向 `5KLBB25A10203862` 执行安装，不启动、不读日志、不截图、不测试，也不操作其他设备。
