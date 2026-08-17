# R107 Fleet rolling interrupted-state persistence

更新时间：2026-08-10

## 范围

本阶段收口第 14 项 App Fleet rolling 的重启边界：App 进程退出后，已经开始的 rolling 任务只能恢复为可见的 `interrupted` 结果，不能自动继续执行，也不能把旧的 `running` 记录误当成新的 preview。

## 实现

- 新增 `AgentHomeDaemonFleetRunStore`，使用现有 `ngfSettingsStoreFacade` 保存版本化 `agent_home_daemon_fleet_run_v1` 记录。
- rolling 开始时保存 `running`；页面销毁和 host 切换仍由 R106 的 run control 写入 `interrupted` 与受控原因。
- App 重启读取到 `running` 记录时，codec 将其一次性归一化为 `interrupted/app_restarted`，恢复 completed、failed、pending 和 excluded step 明细。
- 恢复只用于展示和要求重新 preview；不会自动调用 daemon restart、update 或 rollback，也不会重新消费旧 plan。
- 新 preview 会清除旧运行记录；完成或普通失败会清除记录；损坏、未知 schema 或超限记录安全降级为空状态。
- `AgentHomeDaemonFleetRunStore.test.ets` 覆盖 running→interrupted 迁移、step 恢复和 malformed/schema rejection，并注册到现有 `List.test.ets`。

## 验证

- SDK 23 HAP：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`，退出码 0，`BUILD SUCCESSFUL in 55 s 395 ms`。
- 产物：`entry/build/default/outputs/default/entry-default-signed.hap`，14,457,913 bytes，SHA-256 `D64245358126016E35BC34FA26E56491C3348CEAD677FBC67A7A2E35EC392DB7`。
- `git diff --check`：已执行，无实际空白错误；仅保留既有换行转换提示。
- 本轮未执行设备安装、启动或测试；即使需要安装，也只允许目标设备 `5KLBB25A10203862`。

## 边界

本阶段是 App 持久化与源码验证闭环，不宣称真实 App 进程杀死/重启、跨平台 daemon、自启升级回滚、双 Bridge A → B → A 或指定设备现场已通过。第 14 项继续保持“部分实现”。
