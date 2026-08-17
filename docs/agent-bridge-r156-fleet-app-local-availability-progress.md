# R156 Daemon Fleet App-local Availability Policy

日期：2026-08-15
状态：已完成（第 14 项 Fleet 面板可见性与异步结果归属校验源码子阶段；第 14 项仍为部分实现）

## 目标

修复 Fleet 面板可见性错误依赖“当前活动 Bridge”的 `daemonInstanceIdentity/daemonFleetTarget` capability 的问题。当前活动主机旧版或离线时，会错误隐藏其他已保存且可操作的 Host。正确语义：Fleet 面板可见性只依据 App 本地 fleet orchestration 能力和已保存 host profiles；每个实际目标仍独立使用 `fleetTargetSupported/rollingEligible` 门控写操作；所有异步结果按 hostProfileId + instanceId + generation + host epoch 校验，旧响应不得覆盖新快照。

## 已实现

### App-local availability policy

- 新增 `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetAvailabilityPolicy.ets`：
  - `appSupportsFleetOrchestration()`：App 本地编排能力显式门（当前恒 true，保留未来关闭入口）。
  - `queryableProfileCount(profiles)`：hostProfileId 与 endpoint 均非空的已保存 profile 数量。
  - `isFleetPanelAvailable(profiles)`：仅由 App 本地能力 + 至少一个可查询 profile 决定，不依赖当前活动 Bridge 连接或 capability 广告。
  - `matchesCurrentProfiles(results, profiles)`：collect 结果 hostProfileId 集合与当前 hostProfiles 完全一致；不一致视为迟到批次，拒绝写入。

### 页面接线（NGFAgentHomePage.ets）

- `canUseBridgeDaemonFleet()` 语义改为 App-local availability（调用 policy），不再读取 `currentBridgeServerInfo.features.daemonInstanceIdentity/daemonFleetTarget`。
- Fleet 面板从 daemon 诊断区（`canUseBridgeDaemonManagement` 门内）移出，成为独立设置 stage（stage '8'，connection log 顺延为 '9'）；当前活动 Bridge 旧版或离线时，只要保存了可查询 host profile 就仍可看到 Fleet 面板并查询各 host。
- `refreshDaemonFleet()` 结果写入前增加 `matchesCurrentProfiles(results, this.hostProfiles)` 校验，collect 期间 hostProfiles 增删不会让旧批次覆盖当前列表；既有 connectionEpoch（host epoch）检查保留。
- 每个目标的写操作资格保持不变：`AgentHomeDaemonFleetConnectionPool.createDaemonFleetSnapshot()` 仍要求目标自身 `features.daemonFleetTarget=true` 且实例身份存在（R122 fail-closed），coordinator preview 把不 eligible/isolated 目标放入 excluded，rolling 执行仍校验 expectedInstanceId/expectedGeneration/版本一致性（R86/R105），页面 isolate 按钮仍按 `item.ok && snapshot.rollingEligible` 门控。

### 测试

- 新增 `AgentHomeDaemonFleetAvailabilityPolicy.test.ets` 并注册到 `List.test.ets`，覆盖：无 profile 隐藏、不完整 profile 不可查询、多 profile 可见（无活动 Bridge 依赖）、集合完全匹配接受、集合不一致/长度变化拒绝。

## 自动化证据

- SDK 23 `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；`entry/build/default/outputs/default/entry-default-signed.hap` 于 2026-08-15 12:03:05 生成，大小 `14,546,210` bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`。仅保留既有 syscap、弃用 API（`AudioRenderer.write`）和异常处理警告。
- `git diff --check`：退出码 0。
- 新增 Hypium 测试已注册到 `List.test.ets`（`AgentHomeDaemonFleetAvailabilityPolicy.test.ets`）；测试执行需要设备，不在本机运行，注册与编译风险按既有 R 流程由后续真机/现场验证兜底。

## 未关闭的门

- Windows/Linux/macOS 全局安装、自启重启、真实双 Bridge rolling、升级回滚和 HarmonyOS App Fleet 真机现场仍为第 14 项 FIELD 验收。
- 真实多 host 弱网、collect 超时分布和 rolling 期间 host 断线现场行为仍需现场验证。
- 本轮未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。

因此，第 14 项继续保持“部分实现”。
