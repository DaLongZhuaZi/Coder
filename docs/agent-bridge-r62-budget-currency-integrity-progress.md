# R62 Bridge budget currency integrity

更新时间：2026-08-09

## 目标

修复 Usage cost budget 的币种匹配缺口：CLI/MCP/Provider 传入的大小写和外围空格不能导致预算告警漏报。

## 实施范围

- `UsageManager.record()` 对 event currency 执行 trim/大写，持久化事件与聚合使用同一规范值。
- `UsageManager.budgetSet()` 对 cost budget currency 执行 trim/大写，确保与 summary cost key 一致。
- 保持 token-only budget 不要求 currency；cost budget 仍拒绝缺少 currency 的输入。
- smoke 覆盖小写/空格 currency、budget 保存、cost event 保存和 threshold warning。
- 不跨币种求和，不改变 warning-only 策略，不把缺少币种的 cost 当作可计费数据。

## 验证

本阶段实际通过：

- `node --check src/agent-experience-manager.js`
- `node --check scripts/check-usage-event-normalization-smoke.js`
- `node scripts/check-usage-event-normalization-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`（含 `check:r62`/postcheck）
- `git diff --check`

## 边界

真实 Provider 账单币种、套餐 quota、长会话 compaction、App/真机展示仍属于第 22、34 项 FIELD 门；本阶段不修改 ArkTS、不构建或安装 HAP。
