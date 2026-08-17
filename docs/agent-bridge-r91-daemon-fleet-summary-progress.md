# R91 Daemon Fleet App 聚合摘要

更新时间：2026-08-09

## 目标

补齐第 14 项 App Fleet 面板的健康聚合、Bridge/config 版本分布、告警实例和心跳缺失摘要，同时保留旧 Bridge 只读降级与 rolling target 安全门。

## 实施状态

- [x] 新增强类型 `AgentHomeDaemonFleetSummary` 与版本分布模型。
- [x] 聚合 healthy/degraded/unreachable/incompatible/updating/isolated/unknown 状态。
- [x] 聚合 Bridge 版本、远程配置 active 版本、告警实例数和缺失心跳数。
- [x] Fleet 面板展示汇总信息，并在每个实例行展示最近心跳；不可用/旧 Bridge 仍只计入摘要，不进入 rolling target。
- [x] 新增 Hypium 纯逻辑测试，覆盖状态、版本分布、告警和缺失心跳。
- [x] 中英文资源通过 `scripts/i18n_updater.py` 写入。

## 验证

- `git diff --check`：通过；仅有既有 LF/CRLF 提示。
- `node`：三份中英文资源 JSON 解析通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0；Docker runtime 按仓库规则受控跳过。
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：`BUILD SUCCESSFUL in 37 s 965 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,422,067 bytes，SHA-256 `F6B929E21979DF4ECCDCB2B8CDB95E116005FF9F26BC96AB9661BB45F2EF52C1`。

## 现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启和升级回滚。
- [ ] 双 Bridge A → B → A rolling、真实 heartbeat/generation 连续变化和多 host 现场。
- [ ] 指定设备 `5KLBB25A10203862` 的安装需签名 profile 授权该 UDID；本轮未安装、未启动、未测试设备。

第 14 项继续保持“部分实现”，本轮只关闭 App Fleet 聚合摘要源码子阶段。
