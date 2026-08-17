# R41 Daemon Status Generation Integrity

更新时间：2026-08-09

## 目标

收口 HarmonyOS App 普通 Agent Home 中 daemon status 迟到响应的完整性边界。状态快照必须绑定当前 `hostProfileId`、连接 `epoch` 和请求 id；Bridge/旧客户端可选提供的 `instanceId` 与 `generation` 只能单调推进，不能让旧实例或旧代际覆盖当前 UI。

本阶段不宣称完成第 14 项的跨平台安装、自启、升级回滚或多 Bridge 现场验收。

## 实现

- 新增 `entry/src/main/ets/features/agentHome/AgentHomeDaemonStatusCoordinator.ets`，集中维护当前 host/epoch、pending request、instance identity、generation 和是否已有快照。
- `NGFAgentHomePage` 在 host 激活、daemon status 刷新、Bridge 响应解析和 host 清理路径接入 coordinator。
- 旧 `daemon.status` 缺少 `instanceId`/`generation` 时仍接受兼容快照；一旦建立新实例身份，后续缺失身份或身份变化的快照被拒绝。
- generation 使用 `generation` 优先、`workerGeneration` 兼容回退；低于当前 generation 的快照被拒绝。
- request id、host profile 或 connection epoch 不匹配的响应被丢弃；host 切换和清理会重置完整性状态。
- 状态字段合并保留既有 autostart、doctor、remote config 等可选字段，不收窄旧协议。

## 验证

- `entry/src/test/AgentHomeDaemonStatusCoordinator.test.ets` 覆盖 host/epoch、旧 request、重复响应、身份缺失/变化、generation 回退和旧 Bridge 缺字段兼容。
- `entry/src/test/List.test.ets` 已注册 R41 纯逻辑测试。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0；仅保留既有 syscap、弃用 API 和异常声明警告。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；Node、Provider、CLI/MCP、Web、Browser、Voice、Usage、Remote Config、Schedules/Loops/Chat Rooms smoke 均通过，保留既有 `node-pty AttachConsole` 噪声。
- `hvigor tasks --no-daemon`：退出码 0。
- `git diff --check`：无新增阻断问题，仅有既有换行提示。

## 边界

- 本阶段未安装、启动或测试设备。
- 真实 daemon 多实例、跨平台 generation、双 Bridge rolling 和现场健康聚合仍属于第 14 项 FIELD 门。
- 受支持 Browser host、真实 Voice Provider/音频路由、真实 quota/compaction/metadata 仍分别属于第 16、21/33、22/34 项现场门。
