# Agent Bridge R48 File Transfer Event Scope

更新时间：2026-08-09

## 目标

收口文件上传/下载生命周期事件的连接归属。此前 `file.transfer.progress`、`file.transfer.completed` 和 `file.transfer.failed` 经 `broadcastToClients` 全局发送，事件可能包含 workspace、相对路径、文件名、摘要和传输状态。本阶段只处理文件传输事件投递边界，不改变 binary frame、路径校验、摘要校验、临时文件和断开清理语义。

## 实现

- [x] 新增 `src/file-transfer-event-router.js`，按发起 WebSocket 的 owner connectionId 精确单播；空 owner、未知 owner 和不匹配连接不会投递。
- [x] `FileTransferManager` 的 upload/download state 记录 connection，progress/completed/failed 事件只携带运行期内部 ownerId 到 server 路由层。
- [x] server 发送前删除 ownerId，并将公开事件重新封装为既有 `file.transfer.*` event；HTTP 兼容调用没有 owner 时仍返回 RPC 结果但不广播给其他连接。
- [x] 断开连接继续由 `fileTransferManager.detachConnection()` 取消上传和标记下载；迟到事件不会发给重建连接或其他连接。
- [x] 新增 `check-file-transfer-event-scope-smoke.js`，覆盖双连接单播、空/未知 owner 阻断、公开 payload 和静态接线；加入 `postcheck` 的 `check:file-transfer-event-scope`。

## 验证

- [x] Node 语法检查、file transfer event scope smoke 和 terminal/file IO smoke 均退出码 0。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；包含 `check:file-transfer-event-scope` postcheck。
- [x] `git diff --check`：退出码 0；仅报告既有 LF/CRLF 转换提示，无 whitespace error。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实大文件、弱网、浏览器/ HarmonyOS App 多连接和断线重连现场仍需现场验收。
