# R98 Provider runtime capability gates

更新时间：2026-08-09

## 目标

修正 Provider usage/metadata 顶层 feature 的静态误报。`serverInfo.features` 只能在当前注册运行时确实能够提供对应能力时开启；Provider catalog 中的可选 capability 仍保留协议兼容，但不能把声明字段当作运行时实现证明。

## 实现

- `ProviderRegistry.hasUsageEvents()` 只在至少一个已注册 Provider 标记 `usageEventsAvailable=true` 时返回 true。
- `ProviderRegistry.hasMetadataGeneration()` 要求 Provider 暴露 `generateMetadataResult()` 或 `generateMetadata()`，且没有 runtime configuration error，也不是 `exec` fallback。
- `withProviderUsageCapability()` 对 descriptor 的 `metadataGeneration`、`usageEvents` 和 `providerUsage` 重新按运行时实现归一化；缺字段、无实现、invalid Codex runtime 和 oneshot/exec fallback 均安全返回 false。
- `serverInfo.features.usageEvents` 与 `serverInfo.features.metadataGeneration` 改为读取 Registry 运行时聚合结果，不再读取静态 catalog 描述。
- 保留旧字段和旧客户端兼容：descriptor capability 仍为可选，旧 Bridge 缺字段时 App 继续使用既有降级路径。

## 自动化证据

新增 `check-provider-runtime-capability-smoke.js`，覆盖：

- 无 runtime producer 时顶层 feature 为 false；
- Mock Provider 具备 producer 时顶层 feature 为 true；
- invalid Codex runtime 不发布 usage/metadata capability；
- endpoint-only Provider 只发布安全 HTTPS `providerUsage`，HTTP 或嵌入凭证 URL 仍为 false。

本轮实际执行并通过：

- `npm run check:r28`
- `npm run check:r76`
- `npm run check:r81`
- `npm run check:r87`
- `npm run check:r88`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`
- `git diff --check`

Bridge 全量 check 中 Docker runtime 按现有 opt-in 规则 skipped，未把它记为通过。本轮没有修改 ArkTS，没有构建 HAP，没有连接、安装、启动或测试设备。

## 对齐边界

R98 关闭的是 capability 静态误报这一源码子缺口，不等同于真实 Provider usage/quota、账单凭证、长会话 compaction、四类 metadata 和 HarmonyOS App Usage/Diagnostics 展示已完成。清单第 22、34 项继续保持“部分实现”，上述真实 Provider、长会话和真机内容仍由 FIELD 轨道验收。
