# R124 Web 页面生命周期恢复进度

更新时间：2026-08-10

## 本轮问题

Web UI 原有 `pagehide` 会主动关闭 WebSocket、终端流、GitHub watch、刷新定时器、pending RPC 和 BroadcastChannel，但页面从浏览器 back-forward cache（bfcache）恢复后没有对应的 `pageshow` 路径。用户返回原标签页时页面仍停留在已断开的工作台，必须手动重新提交连接表单。

## 实施内容

- `src/web/app.js` 新增 `restoreTransportAfterPageShow(event)`，只处理 `event.persisted === true` 的 bfcache 恢复。
- 恢复时只复用当前标签的 Bridge endpoint 和仍在内存中的认证会话；不把 bearer token、WebSocket ticket 或凭证写入 URL、localStorage 或新的持久化键。
- 恢复前调用 `prepareTransportForLogin()` 递增连接代际、重置 shutdown/reconnect 状态并重新获取短期 WebSocket ticket；迟到响应继续由既有 generation/pending gate 丢弃。
- 已注销、缺失 endpoint 或没有内存会话时 fail-closed，显示 Connect required，不自动重连。
- 新增 `check-web-page-lifecycle-smoke.js`，并将 `check:r124` 接入 Bridge `postcheck`。

## 修改文件

- `tools/agent-bridge/src/web/app.js`
- `tools/agent-bridge/scripts/check-web-page-lifecycle-smoke.js`
- `tools/agent-bridge/package.json`

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r124`：退出码 0，输出 `web page lifecycle smoke ok`。
- `node --check src/web/app.js`：通过。
- `node --check scripts/check-web-page-lifecycle-smoke.js`：通过。
- `git diff --check`：通过；未发现本轮新增空白错误。
- 本轮未修改 ArkTS、未构建或安装 HAP，未启动或测试设备。

## 对齐结论

R124 只收口第 23B 的 Web bfcache 页面恢复与注销 fail-closed 源码子阶段。真实多标签、旧 Bridge、长终端流、大 Diff、真实 Provider、受支持平台 Browser host 和 HarmonyOS App 现场仍待验收，23B/23D 及第 16、22、34 项继续保持“部分实现”。
