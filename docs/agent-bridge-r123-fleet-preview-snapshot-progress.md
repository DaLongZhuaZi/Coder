# R123 Fleet preview snapshot 元数据进度

更新时间：2026-08-10

## 本轮问题

R122 已在 Fleet connection pool 生成 `fleetTargetSupported` 与 `warningCount`，但 Agent Home 页面创建 rolling preview 时仍按旧构造参数复制 snapshot。旧复制路径会丢失 warning 数量，并让 capability 字段回落到构造函数兼容默认值，造成页面计划状态与目标 Bridge 快照不一致。

## 实施内容

- 在 `AgentHomeDaemonFleetCoordinator.ets` 增加 `cloneDaemonFleetSnapshot()`，显式复制 host、实例、代际、版本、健康、隔离、rolling eligibility、Fleet target capability、heartbeat 和 warning count。
- `NGFAgentHomePage.ets` 的 rolling preview 改为使用该 helper，页面不再自行维护一套旧字段复制列表。
- Hypium 测试覆盖 `fleetTargetSupported=false`、`rollingEligible=false`、warning count 和 isolate 状态在复制后保持不变。

## 修改文件

- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- `entry/src/test/AgentHomeDaemonFleetCoordinator.test.ets`

## 本轮验证

- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 46 s 208 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,491,147 bytes，SHA-256 `18DD2E28A9645BBBB45C0DD8B19137365BB23F0D00F646AEE4468E9F4A6F0B2F`。
- 本轮此前已通过 `npm run check:daemon-fleet-live` 和 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`；本次 ArkTS 修改未改变 Node Bridge 代码。
- `git diff --check`：通过；仅有既有换行转换提示。

本轮未安装、启动或测试设备。后续如安装 HAP，只允许设备 `5KLBB25A10203862`，且只安装不启动、不测试。

## 对齐结论

R123 只收口第 14 项 App preview 状态模型的一致性子阶段，不改变“部分实现”状态。Windows/Linux/macOS 真实全局安装、自启重启、升级回滚、双 Bridge rolling 和 HarmonyOS App Fleet 现场仍待验收。
