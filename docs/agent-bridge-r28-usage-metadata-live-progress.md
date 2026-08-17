# R28 Usage / Metadata live lifecycle

更新时间：2026-08-08

## 目标

把清单第 22、34 项已有的 UsageManager、metadata scope 和 Provider event 接线推进到一次端到端 Bridge 生命周期回归。使用显式测试开关的 Mock Provider 产生可重复的 actual/estimated/quota/compaction 事件；不把 Mock 数据当作真实 Provider 套餐或真机证据。

## 已完成

- [x] Mock Provider 在 `AGENT_BRIDGE_MOCK_USAGE_EVENTS=1` 下产生一条 actual usage、一条 estimated usage 和一条 compaction usage；默认环境保持原行为，不伪造生产数据。
- [x] `sendObservedEvent` 在 Provider usage 缺少 `agentId` 时从当前 session 的权威 Agent 记录补齐，避免 session+agent budget summary 过滤为空，且 Provider 显式 `agentId` 优先。
- [x] 新增 `check-usage-metadata-live-smoke.js`：真实 WebSocket hello/host scope、session create、budget set、message queue/send、异步 usage event 等待、summary/events 查询、四种 metadata kind、host 隔离和断线重连后的 usage/budget 读取。
- [x] smoke 验证 actual token `10+5=15`、estimated token `20`、USD `0.15`、quota `90/100`、compaction `200→80`、budget warning 和 host-other 的零事件隔离。
- [x] `check:r28` 已接入 `postcheck`，后续 Bridge 全量 `npm run check` 自动执行该链路。

## 本轮验证

已执行并退出码 0：

```text
node --check tools/agent-bridge/src/providers/mock-provider.js
node --check tools/agent-bridge/scripts/check-usage-metadata-live-smoke.js
node tools/agent-bridge/scripts/check-usage-metadata-live-smoke.js
```

已执行 Bridge 全量回归并退出码 0：

```text
npm --prefix tools/agent-bridge run check
```

本次 `check` 的 `postcheck` 实际包含 R12、R13、R26、R27、R28 和 Voice platform smoke；本阶段只修改 Node Bridge/测试，不修改 ArkTS，不生成 HAP。

## 尚未关闭的现场门

- [ ] 真实 Codex/OpenCode/Gateway Provider 的 quota endpoint、套餐字段、长会话 compaction 和四类 metadata。
- [ ] 真机 Usage/Diagnostics/metadata 展示、网络异常、host 切换和 session window 生命周期。

因此第 22、34 项继续保持“部分实现”；R28 只关闭 Mock Provider 驱动的 Bridge 端到端生命周期源码子阶段。
