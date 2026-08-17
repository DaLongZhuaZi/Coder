# R86 Daemon Fleet 版本与配置校验

更新时间：2026-08-09

## 范围

本阶段只收口第 14 项的 App Fleet rolling 版本/config 校验，不把跨平台安装、自启/升级回滚或真实双 Bridge 现场验收误记为源码完成。

## 已落地

- `AgentHomeDaemonInstanceSnapshot` 现在保留 Bridge 版本和 active config 版本；连接池从 `daemon.instance.status`/远程配置状态读取并传播这两个字段。
- `AgentHomeDaemonRollingStep` 保存 operation、expected/target Bridge 版本和 expected/target config 版本，preview 结果可供确认和现场追踪。
- restart 要求新 generation、healthy、同 host/instance，并校验 Bridge/config 版本仍与当前快照一致。
- update 使用显式目标 Bridge 版本；页面将目标版本传入 Fleet executor，替换实例必须报告该目标版本。
- config drift 返回稳定 `daemon_config_version_mismatch`；Bridge drift 返回稳定 `daemon_version_mismatch`，不把版本不匹配误报为成功。
- 连接池在等待 replacement generation 时持续刷新 host、instance、health、Bridge/config 版本；host lifecycle epoch 变化会取消在途操作。
- coordinator 维持首错停止，已完成实例不自动回滚，后续目标保留 `pending`；isolated/incompatible/旧 Bridge 只读排除。

## 自动化证据

- `entry/src/test/AgentHomeDaemonFleetCoordinator.test.ets` 覆盖 restart 版本匹配、Bridge 版本变化、update 目标版本、config drift 和全部目标被排除。
- 本轮实际执行：

```powershell
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'
npm run check
```

退出码为 `0`，主 check、MCP/CLI live、远程配置、Usage/Metadata、Voice/Relay、Browser、Docker contract 和 Web smoke 均通过；Docker runtime 依据仓库规则保持默认 skipped。

- SDK 23 HAP 最终源码构建命令：

```powershell
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'
& 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

- 在普通沙箱权限下，Hvigor 曾因写入 `.hvigor/outputs/build-logs/build.log` 返回 `EPERM: operation not permitted, open`；用户授予完整访问后使用受控权限重跑成功，`BUILD SUCCESSFUL in 37 s 336 ms`。最终 HAP 为 `entry/build/default/outputs/default/entry-default-signed.hap`，大小 `14,397,504` bytes，SHA-256 `B219495A5DE9E07A4E3A090C0C7A1FF0B8FF0FACA922D47027A3DEF5233AB6E7`。
- `git diff --check` 通过，无实际 whitespace 错误。

## 权限事实

- 当前执行身份为 `TX_2\\CodexSandboxOnline`，仓库根目录和 `entry` 可写，已通过实际写入验证。
- `.hvigor/outputs/build-logs` ACL 显示 `Authenticated Users: Modify`；普通沙箱对该生成目录的创建写入仍返回拒绝，切换到用户授权的受控权限后 Hvigor 构建成功。
- 使用 `icacls` 为当前身份追加权限返回 `Access is denied`，未修改系统 ACL、未删除 `.hvigor`、未重置工作区。
- 本机诊断事实属于 `.local-rules`，不作为跨机器构建保证；本次未修改系统 ACL、未删除 `.hvigor`、未重置工作区。

## 未关闭的现场门

- Windows/Linux/macOS 全局安装、稳定 instanceId、自启重启、升级/回滚后的 generation/health 恢复。
- 两个以上真实 Bridge 的 A → B → A 切换、同 endpoint 不同 profile、旧 epoch 响应丢弃和凭证隔离。
- 真实签名远程配置、部分实例失败后的现场 rolling 行为。

因此第 14 项继续保持“部分实现”；R86 只作为源码子阶段证据。
