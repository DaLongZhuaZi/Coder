# Agent Bridge R49 Terminal Event Scope

更新时间：2026-08-09

## 目标

收口 TerminalManager 生命周期事件的连接投递边界。此前 `terminal.updated`、`terminal.attention` 和 `terminal.capture.persisted` 由全局广播发送，payload 可能包含 workspace、cwd、capture 路径和运行状态；`terminal.stream.exit` 也需要与同一订阅边界保持一致。本阶段不改变终端 binary frame、capture、PTY、输入/resize/mouse 或旧 RPC 语义。

## 实现

- [x] 新增 `src/terminal-event-router.js`，只为 terminal lifecycle event 选择 creator connection、active terminal subscribers 和匹配连接；缺少 scope 的 terminal event 默认丢弃。
- [x] `TerminalManager.create(payload, connection)` 记录内部 `ownerConnectionId`；session subscriber connection id 与 creator 一起作为运行期投递范围，不进入公开 payload。
- [x] `terminal.updated`、`terminal.attention`、`terminal.capture.persisted` 和 `terminal.stream.exit` 统一通过 `withTerminalScope()` 进入 server 路由；terminal hook 更新仍为 daemon 级全局事件。
- [x] server 发送前调用 `selectScopedTerminalConnections()` 并剥离 `ownerId`/`subscriberIds`；attention notification 只在存在目标连接时创建和投递，避免无范围事件进入共享通知流。
- [x] 连接重建不会继承旧 creator/subscriber scope；已有 `detachConnection()` 清理 terminal subscription，新的连接必须重新 subscribe。
- [x] 新增 `check-terminal-event-scope-smoke.js`，覆盖 creator/subscriber/无关连接隔离、空 scope 丢弃、公开 payload 脱敏和静态接线；加入 `postcheck` 的 `check:terminal-event-scope`。

## 验证

- [x] Node 语法检查、terminal event scope smoke 和 terminal/file IO smoke 均退出码 0。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；precheck、主 check、postcheck 及 R49 smoke 均通过。
- [x] `git diff --check`：退出码 0；仅报告既有 LF/CRLF 转换提示，无 whitespace error。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实多连接 App、超长 terminal stream、capture 大文件、弱网断线重连和跨 host/workspace 权限现场仍需 FIELD 验收。
