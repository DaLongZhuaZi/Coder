# R99 App Provider usage-events capability gate

更新时间：2026-08-09

## 实现

- `AgentBridgeProviderOption` 增加可选语义字段 `usageEventsCapabilityKnown`，与已有 `providerUsageCapabilityKnown` 分开，避免把缺字段误判为明确不支持。
- App parser 在 Provider descriptor 明确出现 `capabilities.usageEvents` 时记录该字段；旧 Bridge 缺少字段时保持 `false`，不改变既有行为。
- Agent Home 的 `supportsUsageEvents()` 现在同时校验 Bridge 全局 `usageEvents` 与当前 Provider 的显式 capability；新 Bridge 上不产 usage event 的 Provider 不再显示 Usage event/refresh 入口。
- metadata 和 provider quota 原有的 Provider-specific gates 不变；host/session scope 与旧 Bridge fallback 保持兼容。

## 验证

扩展 `entry/src/test/AgentBridgeM5Parser.test.ets`：

- 新 descriptor 的 `usageEventsCapabilityKnown` 为 true；
- 新 descriptor 的 `supportsUsageEvents` 按布尔值解析；
- legacy descriptor 缺字段时两个值均为 false。

本轮执行 `git diff --check`，无实际空白错误。ArkTS/HAP 构建和设备操作未执行；现有 R40 Agent Experience、R88 Web Session Experience 与历史 Bridge check 证据继续有效。

## 对齐边界

R99 只收口 App 的 Provider-specific capability gate，不证明真实 Provider usage producer、quota/账单、长会话 compaction 或真机 Usage/Diagnostics 展示完成。第 22、34 项继续保持“部分实现”。
