# R105 Fleet cancellation result integrity

更新时间：2026-08-10

## 范围

本阶段收口第 14 项 App Fleet rolling 的取消结果语义。目标是让 host lifecycle/连接池停止导致的 `cancelled` 能从 Bridge action 结果穿过 App executor 到 Fleet coordinator，避免被显示为普通失败，同时保留首错停止和后续目标待处理的结构。

## 实现

- `AgentHomeDaemonStepExecutionResult` 增加可选 `failureCategory`，旧调用不传值时仍为空。
- `NGFAgentHomePage` 将 `AgentHomeDaemonFleetActionResult.failureCategory` 传入 Fleet step executor result。
- `AgentHomeDaemonFleetCoordinator` 在取消时将当前步骤分类为 `cancelled`、结果状态设为 `cancelled`，并保持后续步骤 `pending`。
- executor 异常、目标身份变化和无分类拒绝分别得到 `executor_error`、`daemon_target_changed` 和 `daemon_operation_failed` 稳定分类。

## 验证

- SDK 23 HAP：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`，退出码 0，`BUILD SUCCESSFUL in 51 s 453 ms`。
- 产物：`entry/build/default/outputs/default/entry-default-signed.hap`，14,428,871 bytes，SHA-256 `F4C64585B47CAF0360AAEE09029B2ECA9FDB305D26E7E2685DF90A09A91F169B`。
- Bridge：`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`，退出码 0；Docker runtime 按仓库 opt-in 规则 skipped。
- `git diff --check`，退出码 0。
- Hypium Fleet coordinator 测试已新增取消断言并纳入现有 `List.test.ets` 注册；本轮构建验证了 ArkTS 编译，未单独启动设备测试 runner。

## 边界

本阶段不宣称真实跨平台 daemon 或多 Bridge rolling 已通过。真实 host 切换、页面销毁、App 重启中断、自启/升级回滚、双 Bridge A → B → A 和指定设备现场仍属于第 14 项 FIELD；本轮未安装、启动或测试设备。
