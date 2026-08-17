# R100 Provider runtime descriptor gate

更新时间：2026-08-09

## 实现

- `provider-registry.js` 新增统一 `providerRuntimeEnabled()` 判定，拒绝 `runtimeConfigError` 和 `runtimePreference='exec'` 的 Provider runtime。
- `withProviderUsageCapability()` 将 runtime-enabled 判定应用到 descriptor 的 `usageEvents` 与 `metadataGeneration`，防止静态 descriptor 在运行时不可用时误开 App 入口。
- `ProviderRegistry.hasUsageEvents()` 与 `hasMetadataGeneration()` 复用同一判定，确保 `serverInfo.features` 与 Provider Catalog 不出现不一致。
- HTTPS endpoint-only `providerUsage` 仍独立保留，不因 chat runtime 不可用而泄露凭证或伪造 usage event capability。

## 自动化证据

`check-provider-runtime-capability-smoke.js` 新增 blocked runtime 场景：Provider 同时带 `runtimeConfigError`、`runtimePreference='exec'`、静态 usage/metadata 声明和方法时，descriptor 与顶层 registry 均必须返回 false。

本轮实际通过：

- `npm run check:r78`
- `node --check src/provider-registry.js`
- `node --check scripts/check-provider-runtime-capability-smoke.js`
- `node scripts/check-provider-runtime-capability-smoke.js`

本轮未修改 ArkTS/HAP，未连接、安装、启动或测试设备。

## 对齐边界

R100 只修正 runtime descriptor capability 一致性，不证明真实 Provider quota/账单、长会话 compaction、四类 metadata、HarmonyOS App Usage/Diagnostics 或现场设备能力完成。第 22、34 项继续保持“部分实现”。
