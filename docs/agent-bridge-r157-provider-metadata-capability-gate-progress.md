# R157 Provider Metadata Generation Capability Gate 一致性

日期：2026-08-15
状态：已完成（第 22、34 项 metadata capability 门禁与 usageEvents 对齐源码子阶段；第 22、34 项仍为部分实现）

## 目标

对齐清单第 22 项剩余步骤 4：“`usageEvents` 和 `metadataGeneration` 在协议层保持可选；App 已消费 Provider descriptor 的 capability，并在当前 Provider 不支持时隐藏 metadata 入口。仍需把同一门禁扩展到真实 session capability 和其他 Provider producer。”

审计发现：App 端 `supportsUsageEvents()` 使用 `!usageEventsCapabilityKnown || supportsUsageEvents` 兼容旧 Bridge 缺字段（保留全局 feature 行为，R99），但 `supportsMetadataGeneration()` 直接读取 `provider.supportsMetadataGeneration`，没有 known 标志——旧 Bridge 的 Provider capabilities 缺 `metadataGeneration` 键时入口被无条件隐藏，即使 `serverInfo.features.metadataGeneration` 为 true 且 Provider 实际实现 metadata 方法，与 usageEvents 的兼容语义不一致。

## 已实现

### App 模型与 parser（`AgentBridgeModels.ets`）

- `AgentBridgeProviderOption` 新增 `metadataGenerationCapabilityKnown: boolean`（构造参数追加在末尾，默认 false；静态 fallback provider 构造不受影响）。
- `parseProviderObject()` 通过 `capabilitiesSource.indexOf('"metadataGeneration"') >= 0` 填充 known 标志，与 `usageEventsCapabilityKnown`/`providerUsageCapabilityKnown` 同模式。

### App 门禁（`NGFAgentHomePage.ets`）

- `supportsMetadataGeneration()` 改为与 `supportsUsageEvents()` 一致：`serverInfo.features.metadataGeneration` 全局 feature + provider 身份存在时，`!metadataGenerationCapabilityKnown || supportsMetadataGeneration`；新 Bridge 发布显式 capability（含 false）时按显式值 fail-closed，旧 Bridge 缺字段保留全局 feature 兼容行为。
- 使用点（Session Detail 区入口、metadata branch/commit/PR 按钮、`requestMetadataSuggestion()`）全部经由该方法门控，无需改动。

### 测试

- `AgentBridgeM5Parser.test.ets` 的 `parsesProviderCapabilityFlagsWithoutChangingLegacyDefaults` 增加 `metadataGenerationCapabilityKnown` 断言：显式 `metadataGeneration:true` 时 known=true；legacy 缺字段时 known=false。

## 自动化证据

- SDK 23 `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；`entry/build/default/outputs/default/entry-default-signed.hap` 于 2026-08-15 12:20:54 生成，大小 `14,545,893` bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`。仅保留既有 syscap、弃用 API（`AudioRenderer.write`）和异常处理警告。
- `git diff --check`：退出码 0。
- 新增断言已注册到既有 `AgentBridgeM5Parser.test.ets`（Hypium 测试执行需要设备，不在本机运行，编译由 SDK 23 HAP 构建的 ArkTS 编译覆盖）。

## 未关闭的门

- Bridge 侧 `metadata.generate` 的 Provider 方法缺失 fail-closed（`capability_unavailable`）已存在（server.js），本轮未改 Node 代码。
- 真实 Provider 的 metadata 长会话、超时/取消、凭证与现场 App 展示仍为第 22、34 项 FIELD 验收。
- 本轮未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。

因此，第 22、34 项继续保持“部分实现”。
