# Agent Bridge R46 Service Event Scope

更新时间：2026-08-09

## 目标

收口 Workspace Service Proxy 状态事件的连接归属。此前 `workspace.service.updated` 使用全局广播，事件 payload 可能包含 workspace、ownerAgent、cwd、端口、域名和运行状态。本阶段只处理 Bridge 事件投递边界，不改变 service RPC、HTTP/WS proxy 或服务进程生命周期。

## 实现

- [x] 新增 `src/service-event-router.js`，按 owner connectionId 精确单播；空 owner、未知 owner 和不匹配连接不会投递。
- [x] `ServiceProxyManager` 保存仅运行期的 `serviceId -> connectionId` owner map，不写入 service state；upsert/start/stop/health/remove 的 WS 入口记录当前 owner。
- [x] service process error/exit、health、stop 和 remove 事件复用运行期 owner；remove 成功后清理 service owner。
- [x] WebSocket 断开时调用 `serviceManager.detachConnection()` 清除相关 owner，避免连接重建后迟到生命周期事件投递给旧连接。
- [x] `server.js` 发送前删除内部 `ownerId`，不再使用 Service 全局广播；HTTP 兼容 RPC 没有 owner 时仍返回同步结果但不向其他 WebSocket 推送。
- [x] 新增 `check-service-event-scope-smoke.js`，覆盖双连接单播、空/未知 owner 阻断、断开清理、公开 payload 去除 owner 和 server 静态接线；加入 `postcheck` 的 `check:service-event-scope`。

## 验证

- [x] Service event scope smoke、Service Proxy manager smoke 和 Node 语法检查均退出码 0。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0；包含 precheck、主 check、postcheck，以及 R12/R13/R26/R27/R28/R29/R30/R32/R35、Voice platform 和 Service event scope 定向回归。
- [x] `git diff --check`：退出码 0；仅输出既有 LF/CRLF 转换提示，没有 whitespace error。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实域名解析、长 WebSocket、跨 host/workspace 权限和服务进程现场仍需既有 23C/FIELD 验收。
