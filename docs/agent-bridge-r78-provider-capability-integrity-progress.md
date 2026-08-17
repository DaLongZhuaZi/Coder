# R78 Provider capability integrity

更新时间：2026-08-09

## 目标

让 Provider descriptor 的 `usageEvents`、`providerUsage` 和 `metadataGeneration` 只在当前运行时确实能够提供对应能力时发布。协议级 `serverInfo.features` 仍表示 Bridge 支持这些 RPC；App 继续以当前 Provider descriptor 做细粒度 gate。

## 已完成

- [x] `ProviderRegistry` 统一收敛 Provider capability：`metadataGeneration` 必须有 `generateMetadataResult()` 或 `generateMetadata()`，`usageEvents` 必须同时声明并设置 `usageEventsAvailable=true`，缺少实现时静态 true 会降级为 false。
- [x] `providerUsage` endpoint capability 只接受 HTTPS 且不允许 URL 内嵌用户名/密码；无 endpoint 的旧 Provider、HTTP endpoint 和凭证 URL 均发布为 false。Provider 原生 `getUsage()` 适配保持兼容。
- [x] Codex 非法 runtime 配置不会发布 usage/metadata capability；exec fallback 同样保持 usage events 与 metadata generation 关闭。
- [x] Mock、Codex App Server、OpenCode 和 Gateway usage producer 显式声明 `usageEventsAvailable=true`；Codex exec runtime 保持 false。
- [x] `check-provider-runtime-capability-smoke.js` 覆盖静态 capability 欺骗、真实 Mock capability、未配置 usage、HTTPS usage、HTTP/凭证 endpoint 和 Provider catalog 透传。
- [x] `check:r78` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`。

## 实际验证

```text
node --check src/provider-registry.js
node --check src/providers/mock-provider.js
node --check src/providers/opencode-provider.js
node --check src/providers/gateway-provider.js
node --check src/providers/codex-app-server-provider.js
node --check scripts/check-provider-runtime-capability-smoke.js
node scripts/check-provider-runtime-capability-smoke.js
```

以上命令本轮均退出码 0。随后执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`，主链与全部 `postcheck`（含 `check:r78`）退出码 0；本轮未修改 ArkTS，因此不重复 SDK 23 HAP 构建，也未安装、启动或测试设备。

## 未关闭的现场门

真实 Provider 的套餐 quota、账单权限、长会话 compaction、四类 metadata 以及 App/真机 Usage 展示仍属于第 22、34 项 FIELD 验收；R78 只关闭 descriptor capability 语义的源码子阶段，不改变总项“部分实现”状态。

设备边界保持：如后续重大功能更新需要安装，只允许向 `5KLBB25A10203862` 安装，且只安装、不启动、不测试。
