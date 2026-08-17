# Agent Bridge R45 Browser Event Scope

更新时间：2026-08-09

## 目标

收口 Browser Automation 生命周期事件的连接归属。此前 `browser.host.registered`、`browser.host.unregistered` 和 `browser.permission.updated` 通过全局广播发送，可能把其他连接的 host/workspace/domain 元数据暴露给不相关客户端。本阶段只处理 Bridge 事件投递边界，不宣称完成真实浏览器、平台 host 或 HarmonyOS App 现场能力。

## 实现

- [x] 新增 `src/browser-event-router.js`，只将带有 owner connectionId 的 Browser 事件精确单播给所属 WebSocket；空 owner 或不匹配连接不会投递。
- [x] Browser manager 为 host 注册/注销和权限更新事件附加仅供 Bridge 内部路由的 `ownerId`；公开 host/result DTO 不包含该字段。
- [x] `server.js` 在发送前复制并删除内部 `ownerId`，使用 owner-scoped router 生成 `browser.updated`；不再调用 Browser 全局广播。
- [x] `browser.permission.set` 的 manager 执行入口接收当前 connectionId，使权限事件与发起连接保持一致；HTTP 兼容 RPC 没有 owner 时不向其他 WebSocket 广播。
- [x] 新增 `check-browser-event-scope-smoke.js`，覆盖双连接单播、空/未知 owner 阻断、公开 payload 去除 owner 和 server 静态接线；脚本已加入 Bridge `precheck`、`check` 与 `check:browser`。

## 验证

- [x] `node --check src/browser-event-router.js`、`node --check src/browser-automation-manager.js`、`node --check scripts/check-browser-event-scope-smoke.js`：退出码 0。
- [x] `node scripts/check-browser-event-scope-smoke.js`：输出 `browser event scope smoke ok`。
- [x] `node scripts/check-browser-automation-manager-smoke.js`：输出 `browser automation manager smoke ok`。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0；precheck、主 check、R12/R13/R26/R27/R28/R29/R30/R32/R35 和 Voice platform postcheck 均通过，包含新 Browser event scope smoke。
- [x] `git diff --check`：退出码 0；仅输出仓库既有的 LF/CRLF 转换提示，无新增 whitespace 错误。
- [x] 本阶段未修改 ArkTS，不生成或安装 HAP；未启动或测试任何设备。

## 边界

- [ ] 真实 desktop/platform Browser host、页面登录态、恶意页面、上传/下载和长流仍需现场验收。
- [ ] HarmonyOS App 全量动作和受支持平台 host 仍由 R7/FIELD 轨道管理；第 16、23D 继续保持“部分实现”。
