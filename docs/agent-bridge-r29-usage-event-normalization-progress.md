# R29 Usage event normalization

更新时间：2026-08-08

## 目标

收口清单第 22、34 项的 Usage 事件输入边界。Provider adapter 已分别规范化主要事件，但共享 `UsageManager` 仍是所有来源的持久化入口；本阶段保证非法数值不会进入事件、预算或诊断聚合，并且不把缺失的 token 字段推导成伪造的 `totalTokens`。本阶段不把 fixture 或 Mock 数据当作真实 Provider 套餐、长会话或真机证据。

## 实施范围

- token、quota、compaction 数值只接受非负安全整数；cost 只接受非负有限数。Provider quota DTO 与 UsageManager 使用同一整数边界。
- 聚合时再次校验已持久化事件，避免历史损坏数据污染 summary。
- 只有 inputTokens 与 outputTokens 同时存在时才推导 totalTokens；单侧字段保持 totalTokens unavailable。
- 新增 UsageManager 定向 smoke，覆盖拒绝非法值、单侧 token、有效小数 cost、重复事件和重启恢复。
- 不改变现有 RPC、字段名或旧客户端默认值；既有显式 totalTokens 和双侧 token 事件保持兼容。

## 验证

本轮已执行并退出码 0：

- `node --check src/agent-experience-manager.js`
- `node --check scripts/check-usage-event-normalization-smoke.js`
- `node scripts/check-usage-event-normalization-smoke.js`
- `node scripts/check-usage-recovery-smoke.js`
- `node scripts/check-provider-usage-smoke.js`
- `npm --prefix tools/agent-bridge run check`
- `git diff --check`

## 边界

- 真实 Codex/OpenCode/Gateway quota endpoint、套餐凭证、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 仍属于 FIELD 验收门。
- 本阶段只修改 Node Bridge 与 smoke，不修改 ArkTS，不生成或安装 HAP。
