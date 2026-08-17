# R89 Provider Usage Capability 聚合

更新时间：2026-08-09

## 目标

修正 Provider Usage 的全局 capability 聚合，使只配置受控 HTTPS `usageEndpoint` 的 Provider 与实现 `getUsage()` 的 Provider 使用同一套可用性判断。此前 `provider.usage.list` 可以成功请求 endpoint，但 `serverInfo.features.providerUsage` 仍可能错误返回 `false`，导致 App 隐藏可用的套餐用量入口。

## 已完成

- `ProviderUsageService.anyAvailable()` 现在遍历注册 Provider，并复用 `isAvailable(provider.id)`；endpoint-only、adapter-only 和未配置/不安全 endpoint 的 capability 结果保持一致。
- 新增 endpoint-only 回归断言，验证全局 capability 在 HTTPS endpoint 存在时开启，同时不改变 endpoint 安全校验和 token 脱敏行为。

## 验证证据

- `node --check src/provider-usage-service.js`
- `node --check scripts/check-provider-usage-endpoint-smoke.js`
- `node scripts/check-provider-usage-endpoint-smoke.js`
- `node scripts/check-provider-runtime-capability-smoke.js`
- `git diff --check`

以上命令本轮均退出码 0。未修改 ArkTS/HAP，未安装、启动或测试设备。

## 未关闭门

- 真实 Provider 账号、套餐 quota/账单 endpoint、长会话 compaction 和真机 Usage/Diagnostics 展示仍待现场验收。
- 第 22、34 项继续保持“部分实现”。
