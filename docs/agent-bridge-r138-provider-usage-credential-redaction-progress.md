# R138 Provider usage 公共结果凭证脱敏

## 目标

补齐 Provider usage 结果的公共边界：Provider 自定义的 `message`、`warnings`、`details`、套餐标签和窗口名称都属于不可信文本，不能把 URL userinfo 或敏感查询参数带入 RPC、Usage store、App 或 Web UI。

## 已实现

- `tools/agent-bridge/src/provider-usage-service.js` 的 `redactProviderUsageText()` 继续处理 private key、Bearer、token、password 和 secret 文本，并新增：
  - `http(s)://user:password@host` URL userinfo 替换为 `http(s)://[redacted]@host`。
  - `token`、`access_token`、`refresh_token`、`api_key`、`apikey`、`client_secret`、`secret`、`password` 和 `credential` 查询参数替换为固定占位符。
  - 脱敏发生在 usage result 进入 RPC 或持久化 quota event 之前，原始 Provider 文本不被保存。
- `check-provider-usage-smoke.js` 覆盖 message、warning 和 detail 三种公开字段，断言 URL 凭证和查询 token 均不可见。
- `check:r138` 已加入 `tools/agent-bridge/package.json`，并进入 Bridge `postcheck`。

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r138`：通过，输出 `provider usage smoke ok`。
- 本轮只修改 Node Bridge、smoke、package 和文档；未修改 ArkTS/HAP，未安装、启动或测试设备。

## 范围边界

R138 只收口第 22、34 项的 Provider usage 公共结果脱敏子阶段，不代表真实 Provider quota、账单、长会话 compaction、metadata 生成或真机 Usage/Diagnostics 已验收；条目继续保持“部分实现”。
