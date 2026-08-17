# R139 Metadata 摘要凭证脱敏

## 目标

保护 `metadata.generate` 发往 Provider 的 timeline/diff 摘要。摘要虽然已经有长度限制和 Bearer/token/private-key 过滤，但 URL userinfo 或敏感 query 仍可能把凭证带入独立 metadata turn。

## 已实现

- `tools/agent-bridge/src/metadata-scope.js` 的 `redactSummary()` 新增：
  - HTTP(S) URL userinfo 替换为 `[redacted]@host`。
  - `token`、`access_token`、`refresh_token`、`api_key`、`apikey`、`client_secret`、`secret`、`password` 和 `credential` query 参数值替换为固定占位符。
  - 继续沿用现有控制字符清理、UTF-8 摘要上限和 private-key/Bearer 脱敏。
- `check-metadata-scope-smoke.js` 覆盖 timelineSummary 与 diffSummary 的 URL userinfo、query token 和原始值不可见断言。
- `check:r139` 已加入 `tools/agent-bridge/package.json`，并进入 Bridge `postcheck`。

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r139`：通过，输出 `metadata scope smoke ok`。
- 本轮只修改 Node Bridge、smoke、package 和文档；未修改 ArkTS/HAP，未安装、启动或测试设备。

## 范围边界

R139 只收口第 22、34 项 metadata 输入摘要的安全子阶段，不代表真实 Provider metadata turn、长会话数据、Git/GitHub 现场应用或真机展示已验收；条目继续保持“部分实现”。
