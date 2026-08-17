# R59 Usage currency integrity

更新时间：2026-08-09

## 目标

继续收口清单第 22、34 项的 Usage 语义：费用只有在事件携带有效币种时才进入费用聚合；缺少币种的 cost 保持事件级可见，但在 summary 中保持 unavailable，避免把不同币种或空币种误合并。

## 实施范围

- `UsageManager` 聚合费用时统一 trim 并转为大写币种代码。
- 没有 `currency` 的 cost 不进入 actual/estimated 费用列表，也不生成 `realCost`/`estimatedCost`。
- 保持 token、quota、compaction 的既有缺失字段语义；不把缺失值写成零。
- 定向 smoke 覆盖完整 USD 费用、缺失币种费用、单侧 token、非法数值、compaction 和重启恢复。
- 不改变既有 RPC 字段，不把 estimated 费用计入 actual，也不跨币种直接求和。

## 验证

本阶段实际通过：

- `node --check src/agent-experience-manager.js`
- `node --check scripts/check-usage-event-normalization-smoke.js`
- `node scripts/check-usage-event-normalization-smoke.js`
- `npm --prefix tools/agent-bridge run check`（含 `check:r59` 与 postcheck）
- `git diff --check`

## 边界

真实 Codex/OpenCode/Gateway 账单币种、Provider 套餐 quota、长会话 compaction、App/真机展示仍属于现场验收门；本阶段只修改 Node Bridge、smoke 和文档，不生成或安装 HAP。
