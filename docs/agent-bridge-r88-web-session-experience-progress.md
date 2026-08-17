# R88 Web Session Experience 进度

更新时间：2026-08-09

## 范围

本阶段补齐 Web UI 对 M5 Session Experience 生产链的消费闭环，范围为：

- `message.queue.list/cancel/retry` 的队列可见状态、取消和失败重试。
- `usage.summary.get`、`usage.events.list`、`usage.budget.get/set` 的 actual/estimated、token、费用、quota、budget 和 compaction 展示。
- `usage.updated`、`usage.budget.warning` 事件触发的当前会话刷新。
- `metadata.generate` 四种 kind 的 preview、编辑、候选切换、复制、重新生成、取消，以及 session title 的安全应用。
- 旧 Bridge 缺字段/能力时的兼容降级和 scope/连接代际保护。

## 实现证据

- `src/web/compatibility.js` 增加 M5 feature gate、queue/usage/quota/budget/metadata 强类型归一化；缺失数值保持 `null`，不伪造零值。
- `src/web/app.js` 统一发送 host/workspace/agent/session/provider scope；体验区按 feature flag 显示，队列操作防重复提交，Usage 展示事件明细和 compaction，Metadata 使用显式 request id 并调用 Bridge cancel RPC。
- `src/web/app.js` 的体验刷新在写入状态前校验连接代际和当前 host/workspace/agent/session，迟到响应不会污染新会话。
- `src/web/index.html` 增加 Session Experience、queue、usage event、budget 和 metadata preview 控件；`styles.css` 复用现有列表/状态样式。
- `scripts/check-web-session-experience-smoke.js` 覆盖 parser 缺字段、未知状态、feature markers、cancel/request id、usage event UI 和 token 不泄漏。
- `scripts/check-web-session-experience-live-smoke.js` 使用临时 Bridge 验证空 queue、空 usage、unset budget 和缺失 session 的 metadata 结构化失败。
- `tools/agent-bridge/package.json` 的 `check:r88` 已接入 `postcheck`，因此全量 check 会执行 R88 定向回归。

## 本轮验证

实际执行并通过：

```text
node --check src/web/app.js
node --check src/web/compatibility.js
node scripts/check-web-session-experience-smoke.js
node scripts/check-web-session-experience-live-smoke.js
node scripts/check-web-ui-contract-smoke.js
node scripts/check-web-multitab-scope-smoke.js
node scripts/check-web-ui-live-smoke.js
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check
git diff --check
```

全量 check 退出码为 0，R88 smoke、既有 Web contract/live、multi-tab、M5 usage/provider 回归和 postcheck 均通过。Docker runtime smoke 按设计未设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1`，仅记录为受控 skip。

本轮未修改 ArkTS，未执行 SDK 23 HAP 构建，也未安装、启动或测试任何设备。若后续产生 HAP，安装目标仍只允许 `5KLBB25A10203862`，且仅安装不启动/测试。

## 边界与后续现场门

R88 证明 Web 源码、协议消费和自动化链路，不替代真实 Provider 长会话/quota/metadata、真实旧 Bridge、双标签浏览器、长 terminal/diff 流、HarmonyOS App 现场或真机键盘/窗口验收。因此清单第 22、34、23B 继续保持“部分实现”；本阶段没有扩大或关闭这些现场状态。
