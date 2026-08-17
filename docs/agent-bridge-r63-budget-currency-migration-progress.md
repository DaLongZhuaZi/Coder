# R63 Budget currency migration

更新时间：2026-08-09

## 目标

保证 R62 的币种规范化对已持久化 v2 budget 同样生效，避免 Bridge 重启后历史小写币种继续漏掉 cost budget warning。

## 实施范围

- `UsageManager.state()` 在加载 v2 状态时幂等 trim/大写所有 budget currency。
- 迁移只修改预算币种字段并原子写回；不重写事件、不删除 warning、不触碰凭证或其他 scope。
- 损坏/非对象 budget 继续跳过并保持现有降级行为。
- normalization smoke 增加旧小写 v2 budget 的读取、恢复和 cost warning 匹配断言。

## 验证

本阶段实际通过：

- `node --check src/agent-experience-manager.js`
- `node --check scripts/check-usage-event-normalization-smoke.js`
- `node scripts/check-usage-event-normalization-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`（含 `check:r63`/postcheck）
- `git diff --check`

## 边界

真实 Provider 账单、quota、长会话 compaction、App/真机 Usage 展示仍为清单第 22/34 项 FIELD 门；本阶段不修改 ArkTS、不构建或安装 HAP。
