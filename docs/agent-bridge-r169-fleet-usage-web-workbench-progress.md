# R169：Fleet 状态 + usage 生产链 + Web 工作台会话闭环现场复验

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4，HTTP RPC 直连）

## 1. R168 冷却修复后的整体健康复验

此前 Web UI 的 codex discovery 拖慢事件循环时 daemon.instance.status 曾超时 15s；本轮在 Web UI 页面仍打开（activeConnections=2）的情况下全部 RPC 快速返回：

| RPC | 耗时 | 结果 |
|---|---|---|
| daemon.status | 87ms | ok=true |
| daemon.instance.status | 46ms | ok=true |
| usage.summary.get | 42ms | ok=true |
| usage.events.list | 42ms | ok=true |
| provider.usage.list | 25ms | ok=true（fail-closed payload）|

-> R168 missingSessionCooldown 生效：Web UI 对已消失 session 的周期查询不再触发昂贵 discovery，事件循环不再被阻塞。

## 2. 第 14 项 Fleet 数据链（HTTP RPC 路径）

daemon.instance.status 返回完整字段：status=running, health=running, instanceHealth=healthy, instanceId=ins__UFSd3cb1roYlqDO, bridgeVersion=0.1.4, nodeVersion=v22.23.2, platform=win32/x64, workerReady=true, pid=52200, supervised=false, generation=0, restartCount=7, consecutiveCrashes=0, crashLoop=false, lastRestartReason=worker_heartbeat_timeout, uptimeSec=633, activeConnections=2。supervised=false 属当前直连模式（supervisor 模式证据见 R162）。

## 3. 第 22/34 项 usage 生产链（mock provider，AGENT_BRIDGE_MOCK_USAGE_EVENTS=1）

- usage.summary.get：eventCount=9，actual（input=10/output=5/total=45 聚合含历史、costs USD 0.45）、estimated（total=60 聚合）、quota（mock 剩余 90/limit 100、window=session、resetAt 完整）、compactions=3（含 R169 会话自动 compaction 200->80）。
- usage.events.list（limit=5）：5 条明细（actual/estimated/compaction 混合），含 R169 会话 ses_2ec7c13c28cd8caf 的 actual 事件（inputTokens=10, outputTokens=5, estimated=false, source=mock-provider）—— 会话发消息->事件生产->聚合->查询全链闭环。
- provider.usage.list（providerId=mock）：ok=false, status=unavailable, availabilityState=unsupported, failureCategory=capability_unavailable —— mock 无 usage endpoint 时 fail-closed 正确（R64/R98/R99/R100 语义，App 端因此隐藏 quota 刷新入口）。

## 4. 第 23B 项 Web 工作台会话闭环（HTTP RPC 等效路径 + Web UI 消费）

- session.create(providerId=mock, title='R169 Web Conversation') -> 新 session ses_2ec7c13c28cd8caf + 新 agent agt_tZF7s_bvazCSmsUL。
- message.send -> assistant 回复 'Mock provider received: (empty message) / Bridge protocol is ready.'。
- session.messages 复验：messageCount=2（user + assistant 完整链）。
- Web UI 消费证据：Refresh 后 Agents 列表 5->6，新增 R169 agent 出现在 agent.list（provider=mock, cwd=F:\DevEcoStudioProject\Coder, workspaceId=wks_zaj5-VK2zd3LSfbb, workspaceMode=shared, ownershipStatus=valid）。

## 4b. 持续消息流（长流 mini）测试

- 同会话连续 5 条 message.send，全部 ok=true；mock provider 模拟回复延迟约 3s/条（2.9-3.8s），第 5 条出现一次 29s 瞬时延迟（provider 侧模拟延迟抖动，非 Bridge 缺陷，health 全程正常）。
- 会话消息累计 12 条（6 user + 6 assistant）；usage.summary.get eventCount 9->24，actual tokens 30/15/45 -> 80/40/120（5 条消息 × 10 in + 5 out 完全对账）。
- 期间遗留 Web UI 标签对已消失 session 的周期查询（含测试双标签打开的 3 次/分窗口期）全部由 R168 冷却 1-2ms 快速失败，无风暴；测试标签关闭后恢复基线频率。

## 5. 设备状态

设备 192.168.5.124 仍深度锁屏：aa start 返回 10106102（developer mode 无法自动解锁），App 各面板现场验证继续等待用户指纹解锁。

## 仍待 FIELD

- 设备端（深度锁屏）：mock provider 连接、App 面板（Fleet/Browser/Voice）现场渲染与操作。
- 真实 Codex App Server（第三方 provider aihub.top 认证慢）、真实 Provider quota/账单。
- 真机音频路由（第 21/33 项真实播放/输入）。
- 多 Bridge rolling、真实 GitHub 现场。
