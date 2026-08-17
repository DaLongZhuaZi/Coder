# R3 Daemon Fleet App 闭环进度

更新时间：2026-08-07

## 目标

依据 `docs/agent-bridge-paseo-alignment.md` 第 14 项的当前事实，完成 App 多 host 实例聚合、健康展示、isolate/re-enable 和 rolling restart/update/rollback 的源码闭环；Bridge 只管理自身实例，App 不成为中心 controller。

## 已完成

- [x] `AgentHomeDaemonFleetConnectionPool.ets` 按 `hostProfileId` 建立短生命周期 Bridge client。
- [x] 凭证按需从安全存储读取，不写入 fleet state、日志或结果；Relay endpoint 不重复读取本地凭证。
- [x] 有限并发查询 `daemon.instance.status`，单 host 失败转为结构化结果，不阻断其他 host。
- [x] 查询和操作绑定 connection/collection epoch；host 切换、页面离开或 `stop()` 会断开进行中的 client，迟到响应不能更新当前结果。
- [x] 支持 restart、update、rollback；操作后轮询 generation 增长和 `healthy` 状态，再返回成功。
- [x] `AgentHomeDaemonFleetCoordinator.ets` 实现 preview、首错停止、completed/failed/pending/excluded 分组。
- [x] Agent Home 已接入实例列表、健康/Bridge/configVersion/heartbeat 展示、刷新、rolling preview/confirm/执行、isolate/re-enable。
- [x] 旧 Bridge 缺少 `instanceId` 时使用临时展示键并标记 incompatible/read-only，不进入 rolling target。
- [x] Bridge feature flag 已拆分为 `daemonFleetOrchestration=false` 和 `daemonFleetTarget=true`；App 以实例身份与 target capability 作为入口门禁。
- [x] `AgentHomeDaemonFleetCoordinator.test.ets`、`AgentHomeDaemonFleetConnectionPool.test.ets` 已加入 `entry/src/test/List.test.ets`。

## 本次验证

### SDK 23 HAP

命令：

```powershell
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

结果：`BUILD SUCCESSFUL in 33 s 909 ms`，退出码 `0`。仅保留既有 syscap 与异常处理能力警告；未出现 R3 相关 ArkTS 编译错误。

### Bridge 全量检查

命令：

```powershell
npm --prefix tools/agent-bridge run check
```

结果：退出码 `0`。本轮 service proxy、browser automation、provider directory、daemon remote config/update/store、agent experience、voice、relay、supervisor、security、protocol alignment、workspace Git/checkpoint、management CLI、GitHub、MCP、notification/push、stdio provider、agent lifecycle、schedule、loop 和 chat room smoke 均通过。

## 仍待现场验收

- Windows/Linux/macOS 全局安装、自启重启、真实 update/rollback 和跨平台路径权限。
- 两个以上真实 Bridge 的 rolling 操作、A → B → A 切换、同 endpoint 不同 host profile、凭证隔离和旧 epoch 响应丢弃。
- 真机平板/折叠屏上的 Fleet 列表、长时间 rolling 状态和断线恢复。

现场失败只重开对应现场子步骤，不回退已通过的单实例 supervisor、remote config、instance identity 或 App coordinator 源码能力。

## 关闭条件

第 14 项继续保持“部分实现”，直到本文件的 Bridge 全量检查证据、Fleet 定向自动化执行证据和所需现场验收证据均已记录；不得以 `daemonFleetTarget` 单个 flag 或空 UI 提前宣告整体完成。
