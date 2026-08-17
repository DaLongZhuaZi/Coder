# R150 Voice Remote Retention Status

日期：2026-08-10  
状态：已完成（Voice 隐私状态源码子阶段；第 21、33 项仍为部分实现）

## 目标

在远程 STT/TTS 已具备独立 capability、生命周期清理与 App 播放状态保护的基础上，补齐可公开、可兼容且不泄露配置的远程数据保留状态。该阶段不把运营方声明伪装为 Provider 的已验证承诺，也不因配置缺失而默认声称不保留。

## 已实现

- `VoiceManager` 支持受控的 `sttRetentionPolicy`、`ttsRetentionPolicy` 进程配置，以及仅在进程启动时读取的 `AGENT_BRIDGE_VOICE_STT_RETENTION`、`AGENT_BRIDGE_VOICE_TTS_RETENTION` 环境覆盖。
- 保留策略只接受 `not_retained`、`ephemeral`、`retained`；缺失、未知或非法值统一归一化为 `unknown`。声明来源只公开 `provider_declared`、`operator_declared` 或 `unknown`，可选时长仅接受非负安全整数。
- `voice.status.privacy` 公开每条远程 STT/TTS 链路的 `dataForwarded`、受限 retention DTO、整体 `status` 和 `userNoticeRequired`。它不返回 endpoint、token、原始环境变量、音频或 transcript。
- 配置了远程端点但保留策略未知时，Bridge 返回稳定 warning：`stt_retention_policy_unknown` 或 `tts_retention_policy_unknown`；未配置远程链路时状态为 `not_applicable`。
- `serverInfo.features.voicePrivacyStatus=true` 明确发布新 DTO。旧 Bridge 缺失该 capability 或字段时，App 使用强类型安全默认值并保持原有 Voice UI 可用。
- Agent Home 在可信 Bridge 连接后请求 `voice.status`，仅在 `userNoticeRequired=true` 时展示本地化风险提示；host 切换会清空旧 status，避免跨 host 状态残留。

## 安全与兼容边界

- 此状态是受控声明，不是对远程 Provider 实际保留行为的独立审计；`provider_declared` 与 `operator_declared` 必须在部署方的合同或服务配置中另行验证。
- 任何未知策略都 fail closed 为 `unknown` 并要求用户提示；不会推断为 `not_retained`、`ephemeral` 或 `retained`。
- 公共 DTO 与 warning 不包含 URL、凭证、绝对路径、原始配置值、音频正文或 transcript 正文；smoke 明确断言这些值不会泄露。
- 原始 `voice.status` capability、旧 `features.voice` 汇总和旧客户端解析路径均保持兼容；新增字段全部可选。

## 自动化证据

- `npm run check:r150`：通过。覆盖未知/已声明策略、合法与非法 policy/source/duration、敏感 endpoint/token 脱敏、Bridge feature flag、App model/parser、风险提示与中英文资源接线。
- `npm run check:r130`、`npm run check:r121`、`npm run check:voice-platform`、`npm run check:r13` 和 protocol alignment smoke：通过。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`：退出码 `0`；Docker runtime 按 opt-in 规则跳过。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 `0`。产物为 `entry/build/default/outputs/default/entry-default-signed.hap`，大小 `14,526,254` bytes，SHA-256 `B6D75A5C7F27544FE39968A54403BAB4A160F913C39328C9522E71DFF9AE68D8`。
- `git diff --check`：通过；仅存在既有 LF/CRLF 提示。

## 现场验收门

- 使用真实 STT/TTS Provider 核对保留声明、数据处理地域、到期删除和声明变更后的用户提示。
- 在指定设备上验证权限拒绝、前后台、耳机/蓝牙、来电抢占、弱网、长录音和实际播放路由。若需要安装，仅允许安装到 `5KLBB25A10203862`，且不得启动、测试、读取日志或操作其他设备。
- 这些现场门未完成前，不将对齐清单第 21、33 项标记为“已实现”。
