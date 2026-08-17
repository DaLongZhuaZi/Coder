# R30 Provider Usage freshness

更新时间：2026-08-09

## 目标

把 Provider quota snapshot 的新鲜度语义从 Bridge 传到 App。过期数据仍可作为最后一次成功获取的只读快照展示，但不得因为重新读取已过期快照而写入新的 Usage quota event；无 `stale` 字段的旧响应继续按旧行为兼容。

## 实施范围

- `normalizeProviderUsage()` 规范化可选 `stale` 字段；Provider 显式标记 stale，或 `expiresAt` 为有效且不晚于当前时间时，结果标记 `stale: true`。
- stale 不伪造为 `ok: false`，保留 `status: available` 和原始安全窗口，方便 App 明确展示最后一次快照。
- `providerUsageQuotaEvents()` 对 stale snapshot 返回空，防止过期 quota 重复进入 UsageManager；没有新字段的旧对象仍可生成 event。
- App `AgentBridgeProviderUsageResult` 与 parser 增加可选语义的安全默认值；Provider Usage 状态显示本地化 stale 文案。
- 新增 `check-provider-usage-freshness-smoke.js` 并注册为 `check:r30`/`postcheck`；App parser 增加 stale 字段断言。

## 验证

- [x] `node --check src/provider-usage-service.js`（退出码 0）
- [x] `node scripts/check-provider-usage-freshness-smoke.js`（退出码 0）
- [x] `node scripts/check-provider-usage-smoke.js`（退出码 0）
- [x] `npm --prefix tools/agent-bridge run check`（退出码 0，包含 `check:r30`/postcheck）
- [x] SDK 23 `assembleHap --no-daemon --stacktrace`（退出码 0，`BUILD SUCCESSFUL in 49 s 247 ms`；HAP SHA-256 `C44FACAC5A87F58E75B1B52021A84A31BDAB01E0F9A51D16E23A3F2A2243F24F`）
- [x] `git diff --check`（退出码 0；仅有既有 LF/CRLF 提示）

本轮 HAP 安装前只执行 `hdc list targets -v`：指定设备 `5KLBB25A10203862` 为 `Offline`，因此未执行安装；未启动应用、未读取设备日志、未进行设备测试，也未触碰其他设备。

## 边界

- 真实 Provider endpoint、套餐凭证、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 仍属于现场验收门。
- 本阶段不把 stale snapshot 当作真实刷新成功，不自动联网修复，也不改变旧客户端协议必需字段。
