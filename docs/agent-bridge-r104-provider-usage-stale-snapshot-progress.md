# R104 Provider usage stale snapshot fallback

更新时间：2026-08-10

## 目标

让 Provider 套餐用量刷新失败时保留最后一次成功快照的只读可见性，同时继续阻止过期数据进入新的 quota Usage event。缓存必须按 host/session/agent/provider/window 隔离，并有明确 TTL 与数量上限。

## 已完成

- [x] `ProviderUsageService` 增加受限内存快照缓存，默认 TTL 15 分钟、最多 128 个 scope 条目；可通过构造选项缩短或关闭 TTL。
- [x] 缓存 key 固定包含 `providerId + hostProfileId + sessionId + agentId + window`，刷新失败不会跨 host、session 或 agent 回退。
- [x] 同 scope 刷新失败时返回 `ok=true`、`stale=true`、`availabilityState=stale`，保留最后一次安全窗口/详情；通过稳定 warning 标记刷新失败，并只公开稳定错误分类，不回显 Provider 原始错误文本。
- [x] stale fallback 继续由 `providerUsageQuotaEvents()` 拒绝，不会重复写入 UsageManager 或触发新的 quota event；缓存 TTL 到期后恢复结构化失败结果。
- [x] Provider 返回的 failureCategory 经过稳定格式校验，异常值降级为受控 fallback，避免把任意文本作为 UI/协议错误类别。
- [x] freshness smoke 覆盖成功 → 失败回退、quota event 抑制、host 隔离、错误分类与 TTL 过期，并接入 `check:r104` 与 Bridge `postcheck`。

## 实际验证

```text
node --check src/provider-usage-service.js
node --check scripts/check-provider-usage-freshness-smoke.js
node scripts/check-provider-usage-freshness-smoke.js
npm run check:r104
```

以上命令本轮均退出码 0。未修改 ArkTS/HAP，未安装、启动或测试设备。

## 边界

- 缓存只存在 Bridge 进程内，不替代 Provider 真实 quota/账单来源，也不把 stale 数据标记为新鲜刷新。
- 真实 Codex/OpenCode/Gateway 账号、长会话 compaction、现场网络恢复和 HarmonyOS Usage/Diagnostics 展示仍属于第 22、34 项 FIELD 验收；本 R104 不关闭清单总状态。
