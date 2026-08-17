# R82 Usage aggregate integrity

更新时间：2026-08-09

## 目标

收口第 22、34 项 Usage summary 的多窗口 quota、数值溢出和预算 token 上限语义，确保缺失或不可安全表示的聚合值保持 unavailable，不覆盖其他窗口，也不伪造零值。

## 已完成

- [x] `UsageManager.summary()` 的 quota 聚合键增加 `window`，同一 Provider/source 的 hour/day/month 或其他命名窗口分别保留。
- [x] token 聚合使用安全整数边界；累加溢出时移除该聚合字段，避免把不可表示的结果返回为错误数值。
- [x] cost 聚合在浮点溢出时移除对应币种，不返回 `Infinity` 或伪造金额。
- [x] `usage.budget.set` 拒绝小数或超出 `Number.MAX_SAFE_INTEGER` 的 token 上限；合法非负安全整数保持兼容。
- [x] 新增 `scripts/check-usage-aggregate-integrity-smoke.js`，覆盖预算边界、双 quota window、token/cost 溢出和重载恢复，并接入 `check:r82` 与 `postcheck`。

## 实际验证

本轮实际执行并通过：

```text
node --check src/agent-experience-manager.js
node --check scripts/check-usage-aggregate-integrity-smoke.js
node scripts/check-usage-aggregate-integrity-smoke.js
node scripts/check-usage-event-normalization-smoke.js
node scripts/check-usage-recovery-smoke.js
node scripts/check-provider-usage-smoke.js
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check
```

全量 Bridge check 退出码为 0，`postcheck` 实际执行到 `check:r82`。本轮仅修改 Node Bridge、测试和文档，没有 ArkTS/HAP 改动，因此没有设备安装；用户指定设备 `5KLBB25A10203862` 未被操作。

## 后续现场门

- [ ] 真实 Provider 多 quota window、跨币种账单和长会话 compaction 现场数据。
- [ ] 指定设备 `5KLBB25A10203862` 上确认 Usage/Diagnostics 多窗口展示；只安装，不启动或测试，且不操作其他设备。
