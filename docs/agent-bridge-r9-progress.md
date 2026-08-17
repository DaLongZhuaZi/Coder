# Agent Bridge R9 Usage 事件隔离与持久恢复进度

更新时间：2026-08-08

## 目标

依据 `docs/agent-bridge-paseo-alignment.md`，继续收口第 22 项“用量/配额/自动元数据/compaction”和第 34 项“用量展示与设置/诊断增强”的源码边界。本阶段只处理 Usage 事件的 host 隔离、旧客户端兼容回送和持久恢复回归，不把真实 Provider quota、真实长会话或真机现场验收写成源码已完成。

## 任务进度

| 任务 | 状态 | 证据 |
|---|---|---|
| Usage 事件按 `hostProfileId` 限定广播 | 已完成 | `tools/agent-bridge/src/usage-event-router.js` |
| `usage.updated` 同 host 多连接同步 | 已完成 | `server.js` `sendObservedEvent()` + usage scope smoke |
| `usage.budget.warning` 保留来源连接 | 已完成 | `UsageManager.record(payload, sourceConnection)` + recovery smoke |
| actual/estimated、token 分类、compaction、quota、window 持久恢复 | 已完成 | `scripts/check-usage-recovery-smoke.js` |
| 全量 Bridge 检查注册 | 已完成 | `tools/agent-bridge/package.json` `check` |
| 真实 Provider quota/metadata 与长会话现场 | 待现场验证 | 依赖真实凭证、endpoint 和长期运行环境 |

## 实现事实

- `sendScopedUsageEvent()` 仅向同一 `hostProfileId` 的连接发送 usage 事件；不同 host 永远不会收到事件。
- 同一个来源连接始终可以收到自己的事件。没有 `hostProfileId` 的旧客户端不会被广播到其他 legacy 连接，但预算告警仍通过 `sourceConnection` 回送给触发它的旧客户端。
- `UsageManager` 的事件 id 去重、actual/estimated 分组、input/output/cache/reasoning/total token、按 currency 分组费用、quota reset、compaction timeline 和 session/day/month 查询在 Bridge 重启后从 usage state 恢复。
- budget warning 的 threshold crossing 状态持久化；重新创建 manager 或重复事件不会重复发出同一窗口告警。
- 本阶段没有修改凭证、Provider endpoint、UI 文案或设备状态，也没有执行 HAP 安装、启动或真机测试。

## 本轮验证

工作区：`F:\DevEcoStudioProject\Coder`

| 命令 | 结果 |
|---|---|
| `node --check src/usage-event-router.js` | 通过 |
| `node --check scripts/check-usage-event-scope-smoke.js` | 通过 |
| `node scripts/check-usage-event-scope-smoke.js` | `usage event scope smoke ok` |
| `node --check scripts/check-usage-recovery-smoke.js` | 通过 |
| `node scripts/check-usage-recovery-smoke.js` | `usage recovery smoke ok` |
| `npm run check` | 通过；本轮全量执行，新增 usage scope/recovery smoke 均包含在内 |

## 剩余门

第 22、34 项继续保持“部分实现”。关闭前仍需至少一个真实 Provider 提供可重复的 turn usage、quota 和四类 metadata 生产数据，并补长会话 compaction、断线恢复、凭证不可用和真实 App 现场证据。自动化通过不替代真实 Provider、HarmonyOS 真机、跨平台 daemon 和多窗口现场验收。
