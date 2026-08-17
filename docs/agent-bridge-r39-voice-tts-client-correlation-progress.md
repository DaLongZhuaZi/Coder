# Agent Bridge R39 Voice TTS Client Correlation Progress

## Scope

本阶段只收口远程 TTS 的 App/Bridge 请求关联和迟到结果隔离，不把真实 Provider 的取消语义、网络中断或真机播放现场验收误记为源码完成。

## Implementation

- Voice payload 增加可选 `clientRequestId`；Bridge 只接受受限字符集和长度，避免把任意文本当作请求标识。
- `VoiceManager` 为 TTS request 保存 client id，并在 `tts.started`、`tts.ready`、`tts.failed`、`tts.cancelled` 及 RPC 结果中回显；旧客户端缺字段时继续按内部 request id 工作。
- `voice.tts.stop` 在提供 client id 时优先按 owner-scoped client id 查找，避免 App 使用过期内部 id 误停另一条 TTS 请求；不带 client id 的旧路径保持兼容。
- App 为每次远程播放生成本地 client id 和 RPC request id；停止操作可在 Bridge 内部 `ttsRequestId` 返回前发送，并记录取消快照。
- App 只接受当前 client id、当前内部 request id 或当前 speak RPC id 的 TTS 结果；取消请求的迟到 response/event、缺少可关联 id 的旧事件以及其他连接的 client id 均丢弃。
- 远程 TTS 进入等待阶段即允许中断；失败或停止后清理当前关联，取消 id 保留为一次迟到结果的拒绝边界。

## Verification

本轮实际执行：

- `node --check tools/agent-bridge/src/voice-manager.js`：退出码 0。
- `node tools/agent-bridge/scripts/check-voice-manager-smoke.js`：退出码 0，覆盖 client id 回显、按 client id stop、迟到 Provider 结果和非法 client id。
- `node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js`：退出码 0，覆盖 App model/parser/client/page 与 Bridge Voice correlation 接线。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0，包含全量 Bridge 与 postcheck；仅有既有 node-pty `AttachConsole` stderr，相关 smoke 仍通过。
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，SDK 23 HAP 构建成功；仅保留既有 syscap、弃用 API、异常处理和扫码能力警告。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，SHA-256 `5EA2E28465CA69451AD6B1CA30DB7EFFB2CD2E862EAA272F6C90EFDEBC4D9C40`。
- 仅向 `5KLBB25A10203862` 执行安装尝试，HDC 返回 `9568423`（签名 profile 未授权设备 UDID）；未启动、未读取日志、未截图、未做设备测试，也未操作其他设备。

## Boundary

第 21、33 项继续保持“部分实现”。真实 Provider 取消/超时、弱网、音频路由、蓝牙/来电、权限状态和长录音仍需 FIELD 验收。
