# R172：message.send 文本别名缺陷修复 + Web UI composer 长流现场验证

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4 + 全量回归 EXIT=0）

## 1. 缺陷发现（真实 Chrome Web UI 长流测试暴露）

在 Web UI composer 长流测试中发现：`message.send` 携带 legacy `message` 字段时，用户消息文本被静默丢弃——mock provider 收到空文本并回复 `(empty message)`，session 历史里 user 消息 text 为空。根因：`message.send` 处理器（server.js MESSAGE_SEND）不像 `agent.run`（server.js 4748 行 `readString(payload,'text',readString(payload,'message',''))`）那样归一化 `message` 别名；payload 原样进入 provider（mock/gateway/opencode/codex/cli 均读 `payload.text`），同时 `agentManager.appendUserMessageToRecord` 也只读 `payload.text`。

影响面：App（`AgentBridgeSendMessagePayload.text`）与 Web UI（app.js sendMessage 发送 `text`）与 CLI（`--text/--message` 在 CLI 层归一）均走 `text` 字段，不受影响；受影响的只是直接以 `message` 字段调用 RPC 的客户端（与 `agent.run` 的别名语义不一致）。

## 2. 修复（tools/agent-bridge/src/agent-manager.js，备份 .bak-r172）

- `providerPayloadForAgent`：provider 路由前统一 `nextPayload.text = readString(nextPayload,'text',readString(nextPayload,'message',''))`（覆盖 agent.run/agent.send 路径）。
- `providerMessagePayloadForSession`：session 级消息路由（message.send + message.queue.retry drain）同样归一化，record 缺失分支也归一化。

修复后验证（当前运行 Bridge，HTTP RPC）：`message:` 字段 → user text 完整落库 + assistant 回显原文；`text:` 字段回归正常。

## 3. 回归 smoke（check:r172，已接入 postcheck）

`scripts/check-message-send-text-alias-smoke.js`：独立 Bridge 实例验证 ① legacy `message` 别名文本落库并回显；② canonical `text` 字段保持；③ `queuePolicy=queue` 的 queue 路径别名文本也落库（3 对消息共 6 条）；单独运行退出码 0。

## 4. Web UI composer 长流现场（第 23B 项）

真实 Chrome（CDP host chrome-cdp-field）中完整走通：登录 → 选择 agent（点击列表按钮，需先 scrollIntoView——agent 列表在视口上方，headless 窗口小且页面已滚动；CDP click 不自动滚入视口，属自动化注意点非产品缺陷）→ composer 连续发送多条消息 → 每条消息的 user 文本与 assistant 回显在 Bridge session.messages 中完整落库（本次 4 条 composer 消息全部带真实文本到达，1 条因刷新后 ref 移位未送达属自动化重试问题，复跑新 ref 后 2/2 成功）。

## 5. 其他观察

- Chromium AX 树惰性计算（新页面前几次 snapshot 只有 generic none 节点）继续出现，为浏览器行为。
- message.queue.list 中已完成的项保留 `accepted` 状态条目（队列状态 v2 attempt history 设计），不影响发送链。
- 本轮未修改 ArkTS/HAP；Bridge 全量 `npm run check`（含 check:r172 postcheck）退出码 0（另行记录）。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling。