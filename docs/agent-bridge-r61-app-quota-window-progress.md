# R61 App quota window integrity

更新时间：2026-08-09

## 目标

让 App 保留并展示 Bridge quota summary 的 `window` 维度，避免 session/day/month quota 在 UI 中混淆。

## 实施范围

- `AgentBridgeUsageQuotaRecord` 增加可选兼容的 `window` 字段，旧响应缺失时为空。
- `AgentBridgeIncomingParser.parseUsageQuotas()` 仅接受 `session`、`day`、`month`，未知值降级为空，不阻断整个 summary。
- quota 卡复用现有 `agent_home_usage_window` 与窗口本地化标签显示 scope；字段缺失显示 unavailable。
- M5 parser smoke 增加 quota window 解析断言；不改变 Bridge RPC 和旧客户端字段。

## 验证

本阶段实际通过：

- SDK 23 `assembleHap --no-daemon --stacktrace`：`BUILD SUCCESSFUL in 52 s 913 ms`
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,313,478 bytes
- HAP SHA-256：`342C96A98AB5B205EBC0F1B08D9106AB2A6B4F84E9040AC49033A0195477D22F`
- R59 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0
- `git diff --check`：退出码 0，仅仓库既有换行提示

## 边界

真实 Provider quota window 的套餐语义、刷新频率和真机展示仍属于清单第 22、34 项 FIELD 验收门。本阶段未安装、启动或测试设备。
