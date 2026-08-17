# R27 Metadata WebSocket disconnect cleanup

更新时间：2026-08-08

## 目标

补齐 R26 文档中“连接断开”缺少真实 transport 证据的问题。该阶段只验证 Bridge 的 WebSocket unregister、metadata pending 清理边界和迟到 Provider 结果隔离，不把真实 Provider 长会话或真机 UI 写成已完成。

## 已完成

- [x] smoke 使用真实 `/ws` 握手、Bearer query credential、随机 `appNonce` 和 `RawWebSocketClient`，而不是 HTTP `/rpc` 模拟连接。
- [x] 第一条 WebSocket 发起带 1500 ms 延迟的 `metadata.generate` 后主动 terminate；Bridge `daemon.status` 返回 `activeWebSocketConnections=0`，证明断开连接已从活动连接集合注销。
- [x] 等待迟到 Provider turn 越过旧 socket 生命周期后，用同一 `requestId` 在新连接重试；新连接正常返回 `ok=true`、正确 `requestId` 和 suggestion，旧连接结果没有跨连接回写。
- [x] smoke 已加入 `package.json` 的 `check:r27`，并由 `postcheck` 纳入 Bridge 全量 `npm run check`。

## 本轮验证

本轮实际执行：

```text
node --check tools/agent-bridge/scripts/check-metadata-request-disconnect-smoke.js
node tools/agent-bridge/scripts/check-metadata-request-disconnect-smoke.js
npm --prefix tools/agent-bridge run check:r26
npm --prefix tools/agent-bridge run check:r27
npm --prefix tools/agent-bridge run check
```

以上命令均退出码 0。全量 `check` 的 `postcheck` 实际再次执行 `check:r26`、`check:r27` 和 Voice platform contract smoke；没有修改 ArkTS，本轮不重复 SDK 23 HAP 构建。

## 尚未关闭的现场门

- [ ] 真实 Provider 四种 metadata kind 的长会话 timeout/cancel、断线、凭证撤销和权限错误。
- [ ] 真机 Usage/Diagnostics/metadata UI、host 切换和跨窗口生命周期。

因此第 22、34 项继续保持“部分实现”；R27 只关闭真实 WebSocket disconnect cleanup 的源码自动化子阶段。
