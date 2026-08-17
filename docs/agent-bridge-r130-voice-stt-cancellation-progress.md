# R130 Voice STT cancellation and late-response guard

更新时间：2026-08-10

## 范围

本阶段收口 Voice Bridge 的远程 STT finish 生命周期。此前 TTS 已有 request identity/cancel gate，但 STT finish 只有 session-level `AbortController`；Provider 忽略 abort 或响应迟到时，取消后的 session 仍可能进入 `session.failed`，并把用户取消误报为 `voice_provider_failed`。

## 实现

- `VoiceManager` 为每个 STT finish 建立内部 request record 和 `sttRequests` registry，记录 requestId、sessionId、owner、AbortController 和取消状态。
- Provider 响应解析前以及发布 `transcript.final` 前校验 request record、session identity、owner 生命周期和 registry 代际；旧 session 或迟到响应不能进入 transcript 事件。
- `voice.session.cancel`、owner detach、session expire 和 shutdown 先标记 request 为 cancelled、终止 controller，再清除 session。
- 取消路径统一返回脱敏的 `voice_cancelled`/`state=cancelled`，不发布 `session.failed`；正常失败仍保持原有稳定 failure category。
- `finally` 无论成功、失败还是取消都清零合并音频 buffer，删除 STT request record，并清理 session 状态。
- `voice.status` 增加可选 `activeSttRequests`，旧客户端可安全忽略。

## 验证

本次实际执行并通过：

- `node --check src/voice-manager.js`
- `node --check scripts/check-voice-manager-smoke.js`
- `npm run check:r130`，输出 `voice manager smoke ok`
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`，退出码 `0`
- `git diff --check`（本次修改无实际空白错误）

Smoke 覆盖用户取消和 owner detach 后 Provider 迟到响应、无 final/failed 事件、取消结果、active session/request 清理，以及既有 TTS/字段校验回归。Docker runtime 依照现有 opt-in 规则跳过。

## 边界

本阶段未修改 ArkTS/HAP，未安装、启动或测试设备。R130 只证明 Bridge STT 生命周期源码和自动化安全边界；真实语音 Provider、弱网、权限、蓝牙/耳机、来电抢占、前后台和 HarmonyOS 真机音频路由仍属于第 21、33 项现场验收，不据此改为“已实现”。
