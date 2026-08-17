# R85 App quota event window compatibility

## Scope

收口 Provider quota 自定义窗口在 Usage event 明细中的解析语义。`usage summary`、`budget` 和查询窗口继续保持 `session/day/month` 兼容集合；只有明确的 quota 事件或带 quota 字段证据的旧事件，才保留安全校验后的 Provider 自定义窗口。

## Progress

- [x] `AgentBridgeIncomingParser.parseUsageEvents()` 在读取 quota 字段和 `kind` 后再决定窗口归一化策略。
- [x] `kind=quota`、`quotaRemaining`、`quotaLimit`、`quotaResetAt` 或 `quotaSource` 证据允许 `hour`、`rolling-7d` 等安全自定义窗口。
- [x] 普通 turn/compaction 事件继续使用 `normalizeUsageWindow()`，自定义窗口不会扩大既有 usage/budget 兼容语义。
- [x] quota 自定义窗口继续拒绝路径穿越、控制字符、Unicode 行分隔符、点路径段和超长值。
- [x] `AgentBridgeM5Parser.test.ets` 覆盖 quota kind、quota 字段证据、普通事件回退和恶意窗口拒绝。
- [x] 定向 Bridge 回归通过：`check:r82`、`check:r83`、`check:r79`、`check:r30`。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，主链和 R12-R83 postcheck 均通过。
- [x] SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0；HAP 大小 `14,388,394` bytes，SHA-256 为 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`。
- [x] `git diff --check` 无实际空白错误；仅有既有 LF/CRLF 转换提示。

## Compatibility

旧 Bridge 缺少 `kind` 或 quota 字段时，普通事件仍按原三值窗口解析；缺失窗口保持空值。新 Bridge 返回的 quota 事件自定义窗口只在通过 App 安全归一化后展示，未知或恶意值保持 unavailable，不伪造成 `session`。

## Field boundary

本阶段未安装、启动或测试设备。真实 Provider 自定义 quota、长会话事件、跨重连刷新顺序和 Usage/Diagnostics 真机展示仍是清单第 22、34 项现场验收门。本轮改动属于解析语义收口，不触发 HAP 安装；如后续出现重大 App 功能更新，安装仍只允许针对 `5KLBB25A10203862`，且仅安装、不启动、不测试。
