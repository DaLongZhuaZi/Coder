# Agent Bridge R15 Provider usage / metadata contract 收口

更新时间：2026-08-08

## 目标

在 R12 scope 与 quota endpoint 安全基线之上，继续收口第 22、34 项可由源码证明的 Provider usage/metadata 语义。真实 Provider 凭证、套餐 quota、长会话 compaction、现场 App 数据仍由 FIELD 轨道验收，不在本文件中提前关闭清单条目。

## 本轮完成

- [x] `normalizeProviderUsage()` 在 Provider 明确返回 `unavailable`、`error` 或 `failed` 状态时将 `ok` 归一化为 `false`，避免不可用套餐被 UI 当成成功数据。
- [x] Provider usage endpoint 的认证请求禁止跨 origin HTTPS 重定向；同 origin HTTPS 重定向仍可用，HTTP 降级、嵌入凭证和重定向限制保持原有拒绝语义。
- [x] Codex App Server 增加结构化 `generateMetadataResult()`，保留 suggestion、最多五条去重 alternatives 和分 kind 校验；旧 `generateMetadata()` 继续返回字符串兼容已有 Provider 调用方。
- [x] Bridge `metadata.generate` 优先消费结构化 Provider 结果，兼容字符串 Provider，并把 alternatives、warnings 和 estimatedUsage 可选字段返回给 App/MCP。
- [x] 定向 smoke 增加 unavailable 状态、认证跨 origin 重定向和 Codex alternatives 覆盖。

## 本轮验证

实际执行并通过：

```text
node --check src/provider-usage-service.js
node --check src/providers/codex-app-server-provider.js
node --check src/server.js
node --check scripts/check-provider-usage-smoke.js
node --check scripts/check-provider-usage-endpoint-smoke.js
node --check scripts/check-codex-app-server-provider-smoke.js
node scripts/check-provider-usage-smoke.js
node scripts/check-provider-usage-endpoint-smoke.js
node scripts/check-codex-app-server-provider-smoke.js
npm --prefix tools/agent-bridge run check
```

以上命令本轮均退出码为 0；全量 check 实际包含 R12/R13 postcheck。由于本轮未修改 ArkTS，未重复执行 SDK 23 HAP 构建，也未生成或安装安装包。

## 仍待现场验收

- 至少一个真实 Provider 的 turn usage、套餐 quota、compaction 长会话和四类 metadata 生产数据。
- 真实凭证撤销、限流、timeout/cancel、断线重连和 App 真机展示。
- 其他 Provider 缺失套餐/metadata 能力时的现场降级体验。

## 下一步

下一阶段从第 16、23D Browser host 或第 14 Fleet 现场轨道选择下一个仍可由源码验证的缺口；不因本轮自动化通过修改第 22、34 项为“已实现”。
