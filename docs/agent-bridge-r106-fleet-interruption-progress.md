# R106 Fleet lifecycle interruption guard

更新时间：2026-08-10

## 范围

本阶段继续收口第 14 项 App Fleet rolling 的生命周期边界：页面销毁、host 切换和 App 重启不能让已经开始的 rolling 自动继续，也不能把生命周期取消后的结果误报为成功。

## 实现

- 新增 `AgentHomeDaemonFleetRunControl`，由页面持有当前 run 的取消句柄并记录受控原因。
- `aboutToDisappear()` 和 `activateHostProfile()` 在停止 Fleet connection pool 前取消当前 run。
- `AgentHomeDaemonFleetCoordinator.run()` 在执行前检查取消、在步骤完成后检查下一步边界，并在最后一步完成后检查取消状态；取消时返回 `status=interrupted`、`interruptionReason`，已完成目标保留在 `completed`，未开始目标保留在 `pending`。
- 未传 control 的旧调用继续使用原有首错停止/成功语义，保持 API 兼容。

## 验证

- SDK 23 HAP：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`，退出码 0，`BUILD SUCCESSFUL in 35 s 949 ms`。
- 产物：`entry/build/default/outputs/default/entry-default-signed.hap`，14,434,278 bytes，SHA-256 `26B0F2E53BD1D65CF24973F7B79E39B48807D01E8CEAA5FC568B9FB39B45A3F7`。
- `git diff --check`，退出码 0。
- R105 已执行 Bridge 全量 check；R106 仅修改 ArkTS coordinator/page/test 和文档，没有 Node Bridge 代码变化。

## 边界

本阶段是源码和编译闭环，不宣称真实 App 生命周期、跨平台 daemon、双 Bridge rolling 或指定设备现场已通过；本轮未安装、启动或测试设备。
