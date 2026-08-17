# R125 Web Browser 刷新 scope 进度

更新时间：2026-08-10

## 本轮问题

Web Browser 工作台的 hosts、instances、pages 列表通过多个串行 RPC 获取。切换 workspace/host、页面关闭或 WebSocket 重连时，旧链路的迟到结果可能覆盖当前 Browser 状态，尤其会把旧 host 的 page/instance 列表显示到新 host。

## 实施内容

- `refreshBrowser()` 为每次刷新分配单调 `refreshToken`，并绑定当前 `connectionGeneration`、workspaceId、socket open 状态和 page lifecycle。
- hosts、instances、pages 每次 await 返回后都执行同一个 `refreshIsCurrent()` gate；instance/page 结果还必须匹配发起请求时的 hostId。
- Browser capability 关闭或当前 workspace 无效时清空 hosts、instances、pages 和截图，避免残留旧 scope 数据。
- 新增 `check-web-browser-refresh-scope-smoke.js`，并将 `check:r125` 接入 Bridge `postcheck`。

## 修改文件

- `tools/agent-bridge/src/web/app.js`
- `tools/agent-bridge/scripts/check-web-browser-refresh-scope-smoke.js`
- `tools/agent-bridge/package.json`

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r125`：退出码 0，输出 `web browser refresh scope smoke ok`。
- Node syntax 检查：`src/web/app.js` 与 smoke 均通过。
- `git diff --check`：通过；未发现本轮新增空白错误。
- 本轮未修改 ArkTS、未构建或安装 HAP，未启动或测试设备。

## 对齐结论

R125 只收口第 23B/23D Web Browser 控制面的迟到刷新与 scope 隔离源码子阶段。真实平台 Browser host、visible/enabled/stable、恶意页面、登录态、上传/下载、多标签和 HarmonyOS App 全量动作仍待现场验收，第 16、23D 继续保持“部分实现”。
