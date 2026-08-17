# Agent Bridge R11 Web Workspace Registry 收口

更新时间：2026-08-08

## 目标

在 R10 Web 连接生命周期控制面之上，补齐 23B Web workspace registry 的可见操作闭环。页面继续复用 Bridge 的 `workspace.registry.*` RPC，不创建平行后端；真实浏览器、多标签、旧 Bridge 和长流仍由 FIELD 现场轨道验收。

## 本轮实现

- `tools/agent-bridge/src/web/index.html` 的 Workspaces 区增加 Import 入口和 `workspace-status` 状态区。
- `tools/agent-bridge/src/web/app.js` 将 workspace 条目渲染为选择、Open、Archive 操作行，并增加请求期间的 `workspaceActionInFlight` 防重复提交。
- Import 调用 `workspace.registry.import`，按 preview -> confirm 执行；缺少 import RPC 的旧 Bridge 回退到现有 `workspace.registry.create`，不改变原有新建流程。
- Open 调用 `workspace.registry.open`，先做 dry-run preview，确认后才允许 Bridge 调用宿主打开器。
- Archive 调用 `workspace.registry.archive`，先预览再确认；结果只标记 registry 记录，不删除本地文件。归档当前 workspace 后清除当前选择，并从 active workspace 中重新选择，避免回到已归档 Agent workspace。
- workspace action 错误优先展示 Bridge 的结构化 message/remediation；旧 Bridge 的 list/create fallback 保留。
- `check-web-ui-contract-smoke.js` 增加 Import/status、三类 RPC、preview/confirm 和 busy guard 合同断言。
- `check-web-ui-live-smoke.js` 在临时 Bridge Home 中创建真实临时目录，验证 import preview/confirm、active list、open preview、archive preview/confirm 以及 includeArchived=false/true 的差异；Open confirm 不执行宿主打开器。

## 本轮实际验证

以下命令均在 `F:\DevEcoStudioProject\Coder\tools\agent-bridge` 执行并通过：

```text
node --check src/web/app.js
node --check scripts/check-web-ui-contract-smoke.js
node --check scripts/check-web-ui-live-smoke.js
node scripts/check-web-ui-contract-smoke.js
node scripts/check-web-ui-live-smoke.js
npm run check
git diff --check -- tools/agent-bridge/src/web/app.js tools/agent-bridge/src/web/index.html tools/agent-bridge/scripts/check-web-ui-contract-smoke.js tools/agent-bridge/scripts/check-web-ui-live-smoke.js
```

`npm run check` 本轮退出码为 0，已注册的 Web、Browser、Service Proxy、Provider directory、daemon、Usage、Relay、MCP/CLI、GitHub、schedule/loop/chat room 和 agent-experience smoke 均通过。未执行 SDK/Hvigor 构建，也未生成或安装 HAP；本轮没有向任何设备发送安装操作。

## 状态与边界

- R11-WEB-WORKSPACE-REGISTRY：源码与临时 Bridge RPC smoke 已完成。
- 23B：仍为“部分实现”。未关闭的现场门包括真实双标签、旧 Bridge 版本、长 terminal/diff 流、真实浏览器环境和 HarmonyOS App 全量 Browser 动作。
- 23D：Bridge/CDP/Web 控制面仍不等同于受支持平台 host、App 全量动作和真实上传下载现场。
- 归档操作只影响 registry 元数据；工作区目录、Agent 和凭证不会因 Web Archive 被删除。

## 后续现场验收

1. 真实浏览器双标签验证 workspace/session 刷新、注销传播和重复订阅清理。
2. 使用旧 Bridge fixture 验证 import fallback、缺 capability/字段和兼容提示。
3. 现场观察长终端流、大 Diff 分页、真实 Browser host 的登录态、上传和下载边界。
