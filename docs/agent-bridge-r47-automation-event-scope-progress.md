# Agent Bridge R47 Automation Event Scope

更新时间：2026-08-09

## 目标

收口 Schedules、Loops 与 Chat Rooms 生命周期事件的连接投递边界。此前三类 manager 的 `onUpdated` 回调直接调用 `broadcastToClients`，事件虽然包含 schedule/loop/room 标识，仍可能把其他 workspace 的运行状态、消息摘要或成员变化推送给未订阅连接。本阶段只处理事件订阅与投递边界，不改变三类 manager 的调度、预算、权限、消息序列或持久化语义。

## 实现

- [x] 新增 `src/automation-event-router.js`，按 schedule、loop、chatRoom 三个 family 保存运行期实体 id 与 workspace 订阅，并只向匹配连接单播。
- [x] 订阅只在成功 RPC 结果中建立；list/get/history/rounds 和写操作返回的实体、运行记录、房间或 workspace scope 会登记到当前连接，失败结果不会授予订阅。
- [x] Schedule、Loop、Chat Room manager 的 server callback 已改用 scoped router，不再使用 `broadcastToClients`；缺少实体/ workspace scope 的事件默认丢弃。
- [x] Chat Room lifecycle event 增加 `workspaceId`，让 message/ack 等只有 roomId 的事件可以进行 workspace 过滤；公开事件不增加连接内部信息。
- [x] WebSocket 断开时清理 automation scope registry，避免连接重建后接收旧订阅事件。
- [x] 新增 `check-automation-event-scope-smoke.js`，覆盖双连接、schedule/loop/room scope、未知 scope 阻断、断开清理和 server/manager 静态接线；已加入 `postcheck` 的 `check:automation-event-scope`。

## 验证

- [x] `node --check`：automation router、server、Chat Room manager 和定向 smoke 均退出码 0。
- [x] automation event scope smoke 退出码 0。
- [x] Schedule manager、Loop manager、Chat Room manager 原有 smoke 均退出码 0。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0；precheck、主 check、postcheck 以及 automation event scope 定向回归均通过。
- [x] `git diff --check`：退出码 0；仅输出既有 LF/CRLF 转换提示，没有 whitespace error。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实多连接 App 订阅、workspace 权限变化、daemon 重启后的重新订阅和长时间 Schedule/Loop/Chat Room 现场仍需现场验收。
