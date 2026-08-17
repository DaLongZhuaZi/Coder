# R31 Fleet executor failure handling

更新时间：2026-08-09

## 目标

保证 daemon Fleet rolling coordinator 在单实例 executor 发生异常时仍返回稳定的首错结果，而不是把异常抛到 App 页面层导致 completed/failed/pending 三组状态丢失。

## 实施范围

- `AgentHomeDaemonFleetCoordinator.run()` 捕获 executor 异常并转换为受控失败消息。
- 首个异常实例进入 `failed`，后续未开始实例保留在 `pending`，已完成实例保持 `completed`；rolling 状态为 `failed`，不自动回滚。
- 新增 Hypium 纯逻辑测试覆盖异常首错、调用次数和 pending 保留。
- 不改变 target identity、generation、healthy replacement 和 isolate 规则；跨平台、多 Bridge rolling 仍是现场门。

## 验证

- [x] `AgentHomeDaemonFleetCoordinator` ArkTS 静态检查（SDK 23 ArkTS 编译通过）
- [x] `AgentHomeDaemonFleetCoordinator.test.ets` 已由现有 `List.test.ets` 注册，新增异常首错断言
- [x] SDK 23 `assembleHap --no-daemon --stacktrace`（退出码 0，`BUILD SUCCESSFUL in 36 s 705 ms`；HAP SHA-256 `E264D2EED61351B6292F60471DC557271E73C4B7134B5E61082A91EFF810D8C9`）
- [x] `git diff --check`（退出码 0；仅有既有 LF/CRLF 提示）

Bridge 全量 `npm --prefix tools/agent-bridge run check` 本轮退出码 0，包含 R30 freshness postcheck。安装前只检查 `5KLBB25A10203862`，设备 Offline，未安装、启动或测试。

## 边界

- 异常消息使用稳定脱敏文案，不回显 Provider、凭证或底层 transport 错误。
- App 关闭、host 切换和连接池 stop 仍由现有 epoch/cancellation 逻辑处理。
