# R52 Push Subscription Host Scope 收口进度

更新时间：2026-08-09

## 目标

让 Push Kit subscription、注册/注销、状态结果和实际投递绑定 `hostProfileId`，避免同一 Bridge 上一个 Host Profile 的通知发送到其他 Host 的设备 token；缺少 host 标识的旧客户端继续兼容无范围行为。

## 已完成

- Push subscription 记录增加可选 `hostProfileId`，公开 DTO 只返回 fingerprint 和 host 标识，不返回原始 token。
- `status/register/unregister` 支持连接 host scope；server 使用当前 WebSocket `clientHello.hostProfileId` 作为权威范围，不信任请求 payload 中的 host 覆盖。
- 同一 token/device 只有在同一 scope 内才会更新；跨 host unregister 返回 `not_found`，不会删除其他 host 的 token。
- `enqueue/deliver` 根据 notification 的 `hostProfileId` 只选择同 host active subscriptions；无 host notification 继续投递到 legacy/全部 active subscriptions。
- 异步 `notification.push.updated` 只向对应 host 的连接发送；push delivery status 和 subscription 列表与 host 读取范围一致。
- 新增 `check-push-notification-scope-smoke.js`，覆盖 A/B 注册、status 隔离、跨 host unregister 阻断、host 定向投递和 legacy 无 host 投递。

## 本轮证据

- `node --check tools/agent-bridge/src/push-notification-manager.js`
- `node --check tools/agent-bridge/src/server.js`
- `node tools/agent-bridge/scripts/check-push-notification-smoke.js`
- `node tools/agent-bridge/scripts/check-push-notification-scope-smoke.js`
- `git diff --check`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`

以上命令本轮退出码均为 0；全量 check 已包含 `check:notification-push-scope`。本轮没有修改 ArkTS、没有构建 HAP，也没有安装、启动或测试设备。

## 仍待现场

AGC Push 权益、真机多 host token 生命周期、前台/后台/锁屏/进程终止、token 失效和跨设备角标/点击仍属于现场验收。
