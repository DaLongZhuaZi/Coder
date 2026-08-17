# R140 Fork context 凭证脱敏

## 目标

保护消息级 fork 的边界历史。Fork context 会持久化为 child 首次 Provider turn 的 chat-history attachment，因此工具摘要和用户消息中的 URL 凭证不能原样跨入 child。

## 已实现

- `tools/agent-bridge/src/agent-manager.js` 的 `redactForkHistoryText()` 新增：
  - HTTP(S) URL userinfo 替换为 `[REDACTED]@host`。
  - `token`、`access_token`、`refresh_token`、`api_key`、`apikey`、`client_secret`、`secret`、`password` 和 `credential` query 参数值替换为 `[REDACTED]`。
  - 保留既有 private key、Bearer、GitHub/OpenAI token、header 和 assignment 脱敏。
- `check-agent-runtime-isolation-smoke.js` 验证 fork history 中 URL 密码、query secret 不可见，同时保留首次注入幂等和原始 tool input/output 排除断言。
- `check:r140` 已加入 `tools/agent-bridge/package.json`，并进入 Bridge `postcheck`。

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r140`：通过，输出 `agent runtime isolation smoke ok`。
- 本轮只修改 Node Bridge、smoke、package 和文档；未修改 ArkTS/HAP，未安装、启动或测试设备。

## 范围边界

R140 只收口第 22、34 项消息级 fork context 的输入安全子阶段，不代表真实 Provider 长会话、跨 workspace fork 现场或真机 App 展示已验收；条目继续保持“部分实现”。
