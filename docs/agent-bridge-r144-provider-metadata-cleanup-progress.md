# R144 Provider Metadata Cleanup

更新时间：2026-08-10

## 目标

收口第 22、34 项 Provider metadata turn 在 timeout、cancel、WebSocket 断开和正常完成路径上的资源清理边界，不改变旧客户端 RPC 语义。

## 实现

- Bridge metadata request state 保存可选的一次性 Provider `cancelMetadata` cleanup hook。
- 用户取消、超时和连接断开会先标记 request 状态并触发 cleanup；cleanup 异步失败只记录受限 failure category，不把内部错误回显给客户端。
- Mock Provider 的延迟 metadata turn 支持取消并清理 request registry，便于稳定自动化验证。
- Codex App Server metadata turn 携带 request id，临时 thread/turn 在取消或正常完成后执行 best-effort `turn/interrupt`、`thread/archive`，并清除本地 session、message 和 usage 快照；取消发生在 thread 创建前时延迟到 thread 创建后安全清理。
- 不支持 cleanup hook 的旧 Provider 保持兼容；Bridge 仍通过 responseSent/detached/host scope gate 丢弃迟到结果。

## 本轮实际验证

- `node --check src/server.js`
- `node --check src/providers/mock-provider.js`
- `node --check src/providers/codex-app-server-provider.js`
- `npm run check:r26`
- `npm run check:r27`
- `npm run check:r144`
- `node --check scripts/check-codex-app-server-provider-smoke.js; node scripts/check-codex-app-server-provider-smoke.js`

以上命令本轮均退出码 0。`check:r144` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`。

## 边界

本轮未执行真实 Codex/OpenCode/Gateway 账号、真实 quota/账单、长时间 Provider 网络故障、HarmonyOS HAP 构建或设备操作；第 22、34 项继续保持“部分实现”，现场证据仍由 FIELD 轨道管理。
