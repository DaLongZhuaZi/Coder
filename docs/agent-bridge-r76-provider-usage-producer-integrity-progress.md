# R76 Provider Usage Producer Integrity 进度

更新时间：2026-08-09

## 目标

收口 Codex App Server、OpenCode 和 Gateway Provider usage producer 的缺失字段语义，使 Provider 只上报真实可获得的数据：单侧 token 不推导 `totalTokens`，缺少费用币种不伪造 `USD`，负数或非法数值保持 unavailable。

## 任务状态

- [x] 审计三类 Provider normalizer 与现有成功 fixture。
- [x] 修正 Codex/OpenCode/Gateway 的 total、currency、负数和非安全整数处理。
- [x] 新增跨 Provider producer integrity smoke，覆盖单侧 token、推导 total、缺失币种、多币种和负数。
- [x] 将 `check:r76` 接入 `tools/agent-bridge/package.json` 的 `postcheck`。
- [x] 更新架构、README、对齐清单和持续推进证据。

## 实现边界

- `totalTokens` 只有 Provider 明确提供，或 `inputTokens` 与 `outputTokens` 同时存在时才出现；reasoning/cache 单独存在不能替代两侧 token。
- `cost` 可以在无币种时保留为事件级原始费用，但不产生 `currency`，也不会进入跨币种费用汇总。
- 负数、非整数或超出安全范围的 token，以及负数/非有限 cost 被视为不可用字段；如果事件只包含非法数值则丢弃，不生成空 usage event。
- 现有 Provider smoke fixture 现在显式提供 `currency: 'USD'`，避免测试依赖旧的隐式默认币种。

## 实际验证

```text
node --check src/providers/codex-app-server-provider.js
node --check src/providers/opencode-provider.js
node --check src/providers/gateway-provider.js
node --check scripts/check-opencode-provider-usage-smoke.js
node --check scripts/check-gateway-provider-smoke.js
node --check scripts/check-provider-usage-producer-integrity-smoke.js
node scripts/check-provider-usage-producer-integrity-smoke.js
node scripts/check-opencode-provider-usage-smoke.js
node scripts/check-gateway-provider-smoke.js
npm run check:r76
```

以上命令本轮均退出码 0。尚未在本阶段构建或安装 HAP；真实 Provider 账单币种、套餐 quota、长会话 compaction 和设备展示仍属于第 22/34 项 FIELD 验收。
