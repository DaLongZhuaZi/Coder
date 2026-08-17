# Agent Bridge R10 Web 生命周期收口

更新时间：2026-08-08

## 目标

在 23B Web UI 现有认证、工作区、会话、终端、Git/Diff、诊断、GitHub 和 Browser 控制面之上，收口连接生命周期竞态。源码阶段要求显式登出、跨标签登出、页面销毁、断线重连、重复刷新和旧 socket 结果互不污染；真实浏览器、多标签、旧 Bridge 和长流仍属于现场验收。

## 本轮实现

- `tools/agent-bridge/src/web/app.js` 增加 `reconnectEnabled`、`pageClosing` 和 `connectionGeneration`，连接创建、open、close 和重连 timer 均校验代际，旧 socket 不能覆盖新连接。
- 增加 `shutdownTransport()` 统一释放重连 timer、刷新 timer、GitHub watch、terminal subscription、pending RPC 和 BroadcastChannel；`pagehide`、显式 logout、跨标签 logout 都进入同一清理路径。
- `refreshInFlight` 合并重复的全量刷新请求，避免定时器、手动刷新和跨标签消息并发触发全量状态树请求。
- `refreshAllInternal()` 在 health、agent、workspace、session、notification、diagnostics 和 GitHub 阶段校验当前连接代际；页面销毁或连接替换后的迟到结果以 `WEB_REFRESH_CANCELLED` 丢弃。
- `restoreTabIdentity()` 支持清理后重新建立 BroadcastChannel；重新提交登录表单通过 `prepareTransportForLogin()` 恢复重连、刷新 timer 和连接代际，登出后同页可再次登录。
- Web contract smoke 增加重连开关、页面销毁、连接代际、刷新合并、刷新生命周期校验、登录恢复和统一 shutdown 断言。

## 本轮实际验证

以下命令均在 `F:\DevEcoStudioProject\Coder\tools\agent-bridge` 执行并通过：

```text
node --check src/web/app.js
node --check scripts/check-web-ui-contract-smoke.js
node scripts/check-web-ui-contract-smoke.js
node scripts/check-web-ui-live-smoke.js
npm run check
```

`npm run check` 的本轮结果包含 Web contract/live/GitHub、Browser manager/CDP/live、Service Proxy、Provider directory、Usage scope/recovery、protocol alignment、MCP/CLI、Schedule/Loop/Chat Room 等已注册 smoke，进程正常结束。未执行 SDK/Hvigor 构建，本轮没有生成或安装 HAP。

## 状态与边界

- R10-WEB-LIFECYCLE：源码已完成。
- 23B：继续“部分实现”。现场门包括真实双标签刷新/注销传播、旧 Bridge 缺字段降级、长 terminal binary 流、大 Diff 长内容、真实浏览器环境和 HarmonyOS App 全量 Browser 动作。
- 23D：Bridge/CDP/Web 源码控制面已完成，受支持平台 host、App 全量动作、真实上传下载和恶意页面现场仍待验。
- 本阶段没有向任何设备安装或启动应用。

## 下一步

1. 在真实浏览器执行双标签 workspace/session 刷新、注销传播和重复订阅清理。
2. 使用旧 Bridge fixture 验证缺 capability/字段、刷新失败和兼容提示。
3. 现场观察长终端流、大 Diff 分页和 Browser host 的上传/下载/登录态边界。
4. 现场通过后，只更新对应 23B/23D/16 的现场证据，不把源码 smoke 误记为现场通过。
