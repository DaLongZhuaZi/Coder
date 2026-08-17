# R122 Fleet target capability gate 进度

更新时间：2026-08-10

## 本轮问题

Fleet App 之前只要 `daemon.instance.status` 返回 `instanceId`，就可能把目标标记为可 rolling。实例身份只能证明响应来自某个 Bridge，不能证明该 Bridge 同意作为 Fleet target；带实例身份但关闭 Fleet target 的旧版或受限 Bridge 不应进入 rolling pending。

## 实施内容

- `AgentHomeDaemonInstanceSnapshot` 增加 `fleetTargetSupported` 和归一化后的 `warningCount`，构造参数保持可选以兼容已有调用。
- `createDaemonFleetSnapshot()` 从目标自身的 `status.featuresJson` 读取 `daemonFleetTarget`。只有存在 `instanceId`、明确 `daemonFleetTarget === true` 且健康状态不是 `incompatible` 时才设置 `rollingEligible=true`。
- capability 字段缺失、JSON 无效或明确为 `false` 均 fail-closed：目标可继续只读展示，但不会进入 rolling 操作。
- Fleet summary 只聚合 warning 数量，不返回 warning 文本，避免把远端诊断内容带入聚合状态。
- daemon fleet live smoke 要求真实 Bridge 显式宣告 `features.daemonFleetTarget === true`。

## 修改文件

- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetConnectionPool.ets`
- `entry/src/test/AgentHomeDaemonFleetConnectionPool.test.ets`
- `tools/agent-bridge/scripts/check-daemon-fleet-live-smoke.js`

## 本轮验证

- `node --check scripts/check-daemon-fleet-live-smoke.js`：通过。
- `npm run check:daemon-fleet-live`：通过，输出 `daemon fleet live smoke ok`。
- SDK 23：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：`BUILD SUCCESSFUL in 42 s 997 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,491,423 bytes，SHA-256 `B3F58525F6EA7E70B0F4B548DD4545E66B5F1E4914590512638C97560DA5993E`。
- `git diff --check`：通过；仅有既有换行格式提示，无实际空白错误。

本轮未安装、启动或测试任何设备。若后续需要安装，只允许设备 `5KLBB25A10203862`，且只安装不启动、不测试。

## 对齐结论

R122 只收口第 14 项的 per-target capability fail-closed 源码子阶段，不改变第 14 项“部分实现”状态。Windows/Linux/macOS 真实全局安装、自启重启、升级回滚、双 Bridge rolling 和 HarmonyOS App Fleet 现场仍是 FIELD 验收门。
