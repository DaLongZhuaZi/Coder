# R83 Usage quota snapshot ordering

更新时间：2026-08-09

## 目标

保证同一 Host、session、Provider 和 quota window 的乱序事件不会让 Usage summary 回退到更旧的快照，同时保留所有事件历史和既有幂等行为。

## 已完成

- [x] `UsageManager.summary()` 对相同 `providerId + quotaSource + window` 只选择 `occurredAt` 较新的快照。
- [x] 当时间相同或均不可解析时使用稳定 `eventId` 作为确定性 tie-break；不会依赖事件到达顺序。
- [x] 其他 quota window 继续独立保留，事件历史不删除、不重写。
- [x] 新增 `check-usage-quota-order-smoke.js`，覆盖迟到旧事件、双窗口和重新加载恢复，并接入 `check:r83` 与 `postcheck`。

## 实际验证

本轮实际执行并通过：

```text
node --check src/agent-experience-manager.js
node --check scripts/check-usage-quota-order-smoke.js
node scripts/check-usage-quota-order-smoke.js
node scripts/check-usage-aggregate-integrity-smoke.js
node scripts/check-usage-event-normalization-smoke.js
node scripts/check-usage-recovery-smoke.js
```

随后执行 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`，全量 Bridge check 与 `postcheck`（含 `check:r83`）退出码 0；没有 ArkTS/HAP 改动和设备操作。

## 后续现场门

- [ ] 真实 Provider 并发刷新、ETag/限流退避和跨重连 quota snapshot 顺序。
- [ ] 指定设备 `5KLBB25A10203862` Usage/Diagnostics 真实展示；如需安装只安装，不启动或测试，且不操作其他设备。
