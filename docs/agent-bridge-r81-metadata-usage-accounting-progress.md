# R81 Metadata Usage Accounting 进度

更新时间：2026-08-09

## 目标

补齐 metadata turn 的 usage 生产链：Provider 能提供的真实 token/cost 进入 UsageManager，按当前 host/session/agent 作用域持久化，并通过 `usage.updated` 通知 App；重复 metadata 请求不能重复计费。

## 已完成

- [x] Codex App Server 的 metadata turn 保留完成 turn 的 usage 快照，并将其标记为 `kind=metadata` 的可选结果字段。
- [x] metadata scope normalizer 只接受非负安全整数 token、非负有限 cost、受限 currency 和合法 ISO 时间；无有效数值时不生成 usage event。
- [x] Bridge metadata handler 按当前连接 host、Agent session 和 agent scope 记录 metadata usage，并向同 host 连接发送 `usage.updated`；响应增加可选 `usageEventsRecorded`。
- [x] UsageManager 继续使用现有 event id 幂等规则；Provider 重复返回相同 metadata event id 时不会重复聚合或触发预算告警。
- [x] Mock Provider 仅在 `AGENT_BRIDGE_MOCK_METADATA_USAGE=1` 测试开关下返回 usage fixture，不改变默认旧 smoke 的事件数量。
- [x] 新增 `check-metadata-usage-accounting-smoke.js`，覆盖 normalizer 安全降级、live metadata usage event、actual token/cost 聚合和重复请求幂等；已接入 `check:r81` 与 Bridge `postcheck`。

## 实际验证

本轮实际执行并通过：

```text
node --check src/metadata-scope.js
node --check src/providers/codex-app-server-provider.js
node --check src/providers/mock-provider.js
node --check src/server.js
node --check scripts/check-metadata-usage-accounting-smoke.js
node scripts/check-metadata-usage-accounting-smoke.js
node scripts/check-metadata-scope-smoke.js
node scripts/check-usage-metadata-live-smoke.js
npm run check:r81
```

本轮未修改 ArkTS，未构建或安装 HAP；因此没有设备操作。真实 Codex/OpenCode/Gateway 账户账单、长会话 compaction、真实 metadata Provider 响应和真机 Usage 展示仍属于第 22、34 项 FIELD 验收门。

## 后续现场门

- [ ] 使用真实 Codex App Server 响应确认 metadata turn usage 的字段和账单权限。
- [ ] 验证长会话 compaction 与 metadata usage 在 daemon 重启、断线重连后仍正确聚合。
- [ ] 在指定设备 `5KLBB25A10203862` 完成 App Usage/Diagnostics 展示现场；不操作其他设备。
