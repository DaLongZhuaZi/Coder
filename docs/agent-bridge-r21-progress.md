# Agent Bridge R21 Provider quota snapshot progress

更新时间：2026-08-08

## 目标

持续依据 `docs/agent-bridge-paseo-alignment.md` 的真实状态推进第 22、34 项。本轮只收口 Provider usage 刷新到 scoped Usage store 的源码子阶段，不把真实 Provider 凭证、套餐接口、长会话 compaction 或真机展示误记为已验收。

## 本轮完成

- [x] `provider-usage-service.js` 新增 `providerUsageQuotaEvents()`，只从 `ok=true` 且具备真实 remaining/limit/resetAt 的窗口生成 `kind=quota`、`estimated=false` 的 Usage event。
- [x] quota event 的 eventId 基于 host/session/agent/provider/window/配额内容摘要生成；相同快照可被 `UsageManager` 幂等去重，数值变化生成新快照。
- [x] `provider.usage.list` server handler 将配额快照写入现有 `UsageManager`，按 hostProfileId 通过 `usage.updated` scoped 通知当前 host；响应增加可选 `usageEventsRecorded`、`usageSnapshotAt`。
- [x] Provider usage 的 plan、details、warnings、message 和 remediation 在进入 RPC/持久化前做长度限制与 token/private-key 脱敏。
- [x] Provider usage smoke 覆盖 quota event、Bearer 脱敏、重复刷新、summary 恢复和 host 隔离，并保留在 Bridge 全量 `check`。

## 实际验证

- `node --check src/provider-usage-service.js`：退出码 0。
- `node --check src/server.js`：退出码 0。
- `node --check scripts/check-provider-usage-smoke.js`：退出码 0。
- `node scripts/check-provider-usage-smoke.js`：`provider usage smoke ok`，退出码 0。
- `npm run check`（`tools/agent-bridge`）：退出码 0；precheck、主 check、postcheck（R12/R13/voice-platform）均完成。

## 未关闭边界

- 真实 Codex/OpenCode/Gateway/Hermes quota endpoint、认证凭证、套餐窗口和长会话 compaction 仍需现场服务验证。
- 第 22、34 项仍保持“部分实现”；本轮没有修改 HAP，也没有执行设备安装。
- 设备安装限制仍为仅 `5KLBB25A10203862`，且仅安装不启动/不测试。

## 下一步候选

- R22：为 Browser Automation 增加显式 platform host kind/capability readiness，避免普通 CDP host 被误认为 HarmonyOS/受支持平台 host。
- 现场轨道：真实 Provider usage/metadata、真机 Voice、跨平台 daemon、真实 Browser host 与多标签长流。
