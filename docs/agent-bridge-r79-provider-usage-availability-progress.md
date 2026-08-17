# R79 Provider usage availability state

更新时间：2026-08-09

## 目标

补齐 Provider 套餐用量查询的状态语义，让 Bridge 与 App 区分不支持、支持但暂无数据、正常数据、失败、过期和加载中。旧客户端继续使用既有 `status` 与 `stale` 字段。

## 实施范围

- `normalizeProviderUsage()` 增加可选 `availabilityState`，允许 `unsupported`、`available`、`available-empty`、`failed`、`stale` 和 `loading`。
- 未配置 Provider usage adapter/endpoint 的结果归一化为 `unsupported`；超时、HTTP、格式和 Provider runtime 失败归一化为 `failed`。
- 成功但没有 plan、window 或 detail 数据时归一化为 `available-empty`；有真实数据时为 `available`；过期快照优先标记为 `stale`。
- 保留旧 `status`/`ok`/`stale` 字段，新增字段不改变 `provider.usage.list` RPC，也不将估算值写入 quota event。
- App `AgentBridgeProviderUsageResult` 增加强类型状态常量与安全默认值；parser 支持新字段和旧响应推导。
- Agent Home Provider Usage 区按状态使用本地化文案，避免把支持但暂无数据展示为普通 available。
- 新增 `check-provider-usage-availability-smoke.js` 并接入 `check:r79`/`postcheck`；复用 `AgentBridgeM5Parser` 覆盖 App parser。

## 验证

- [x] `node --check src/provider-usage-service.js`
- [x] `node scripts/check-provider-usage-availability-smoke.js`
- [x] `node scripts/check-provider-usage-smoke.js`
- [x] `git diff --check`
- [x] Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`（退出码 0，包含 `check:r79`）
- [x] SDK 23 `assembleHap --no-daemon --stacktrace`（退出码 0，既有 syscap/弃用 API/异常处理警告；HAP 大小 `14,390,147` bytes，SHA-256 `0F979D1BB48873AED61D10E1557BCEB6ECCCF4ECD0F71A6AE7C49AF58A9EE052`）
- [x] 仅向 `5KLBB25A10203862` 执行 `install -r`；HDC 返回 `9568423`，签名 profile 未授权该设备 UDID。未启动、不测试、不操作其他设备

## 边界

真实 Provider quota 凭证、长会话 compaction、metadata 生产链和真机展示仍是第 22、34 项 FIELD 验收门；本阶段只关闭状态语义的源码子阶段，不更新清单总状态。
