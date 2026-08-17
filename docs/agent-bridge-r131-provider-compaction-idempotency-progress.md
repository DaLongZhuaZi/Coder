# R131 Provider compaction event idempotency

更新时间：2026-08-10

## 原始缺口

Codex App Server compaction 事件此前使用进程内递增序号生成 `eventId`。同一 compaction 在断线重放或重复通知时会得到不同 id，导致 Provider 层重复发布 `usage.updated`；UsageManager 的事件去重只能在事件已经产生后补救。

## 实现

- `codex-app-server-provider.js` 新增稳定 `compactionIdentity()`：优先使用 Provider item/compaction id，其次使用 turn id，最后使用受限 timestamp、reason、beforeTokens 和 afterTokens 快照。
- compaction event id 固定为 `codex:<threadId>:compaction:<stable-identity>`，不包含原始正文、工具输入或凭证。
- Provider 保存最多 4096 个已发布 event id；重放命中时不再次 emit，超过上限时只淘汰最旧 id，避免无界内存。
- 录制 session smoke 首次回放后再次完整回放 compaction，断言公开事件数量仍为 3，且 eventId 顺序完全一致。

## 本次验证

实际执行并通过：

```text
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package json ok')"
npm run check:r131
git diff --check
AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check
```

结果：package JSON 解析通过；`provider recorded session smoke ok`；Bridge 全量 check 退出码 0。Docker runtime 按 opt-in 规则输出 skipped，不影响源码回归。

## 范围与未关闭项

本轮仅修改 Node Bridge、Provider recorded-session smoke 和文档，未修改 ArkTS/HAP，未构建、安装、启动或测试设备。R131 只收口 Provider usage producer 的 compaction 幂等子阶段；清单第 22、34 项仍需真实 Provider quota、长会话 compaction、metadata、凭证和现场 App Usage/Diagnostics 展示证据，继续保持“部分实现”。
