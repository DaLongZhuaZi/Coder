# R51 通知 Host Scope 收口进度

更新时间：2026-08-09

## 目标

将 Bridge 通知持久化、读取、状态变更和终端/Agent 通知投递绑定到连接声明的 `hostProfileId`，避免同一 Bridge 上不同 Host Profile 看到或修改彼此的 Agent、workspace、terminal 通知；缺少 host 标识的旧客户端继续使用兼容的无范围行为。

## 已完成

- `notification-manager.js` 为通知记录增加可选 `hostProfileId`，旧记录缺失时归一化为空字符串。
- `list`、`read`、`action`、`prune` 以显式 host scope 过滤；跨 host 的 read/action 返回 `not_found`，不会修改目标通知。
- scoped prune 只清理当前 host，返回的剩余数和 unread 数也只反映当前 host；其他 host 和 legacy 无范围通知保留。
- server 根据 WebSocket `clientHello.hostProfileId` 分组创建通知，每个 host 独立计算 unread count；终端 attention 事件按目标连接和 host 分组单播。
- `sendObservedEvent` 为普通连接写入当前 host 的 Agent 通知；内部 automation connection 按已确认 workspace scope 转发到实际目标连接，并不把通知持久化为 `bridge-automation` host。
- 增加 `check-notification-scope-smoke.js`，覆盖 host A/B 列表隔离、无 host 兼容、跨 host read/action 阻断、scoped prune 和 event draft scope。

## 本轮证据

- `node --check tools/agent-bridge/src/notification-manager.js`
- `node --check tools/agent-bridge/src/server.js`
- `node tools/agent-bridge/scripts/check-notification-smoke.js`
- `node tools/agent-bridge/scripts/check-notification-scope-smoke.js`
- `git diff --check`

以上命令本轮均退出码 0。随后执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，包含新 `check:notification-scope` 的 precheck、check 和 postcheck，退出码 0；本轮没有修改 ArkTS、没有构建 HAP，也没有安装、启动或测试设备。

## 仍待现场

真实多 Host App 连接、断线重连后的通知补发、Push/AGC 角标及跨设备点击路由仍属于现场验收，不用 smoke 结果替代。
