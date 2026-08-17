# R19 Fleet Target Integrity 进度

更新时间：2026-08-08

## 目标

收口 Daemon Fleet rolling 操作的目标实例完整性：App 预览和执行必须绑定
`hostProfileId`、`instanceId` 与 `generation`，旧实例或旧代际的响应不能继续驱动
restart/update/rollback；同时保留旧客户端不带目标字段时的兼容行为。

## 已完成的源码工作

- 新增 `tools/agent-bridge/src/daemon-target-guard.js`，集中校验目标实例、连接
  host profile 和 generation，并返回稳定的 `failureCategory` 与 remediation。
- `tools/agent-bridge/src/server.js` 的 daemon restart/update/rollback handler 在
  执行前调用 target guard；目标实例变化、代际过期、host 不匹配和非法 generation
  均在写操作前阻断。
- `AgentBridgeDaemonTargetPayload` 及 daemon lifecycle client 请求增加可选
  `expectedInstanceId`、`expectedGeneration`、`hostProfileId`，旧调用签名保持可用。
- `AgentHomeDaemonFleetCoordinator` 将每个 rolling step 的 host/instance/generation
  身份贯穿 preview、执行、轮询和结果聚合；轮询发现 instance 改变时拒绝继续。
- Fleet isolate/re-enable UI 使用本地隔离集合，不再依赖刷新后总为 false 的 snapshot
  字段；isolated host 不会进入新的 rolling target set。
- 新增 coordinator 测试覆盖目标实例变化、generation 不增长和首错停止。
- 加固 target guard：显式目标字段现在要求当前 `instanceId`、连接 `hostProfileId` 和 generation 严格存在并匹配；显式 `expectedGeneration: 0` 也参与比较，只有完全未提供字段时才走旧客户端兼容路径。

## 本轮实际验证

以下命令均于 2026-08-08 在当前工作区执行：

| 验证 | 命令 | 结果 |
|---|---|---|
| Target guard 定向 smoke | `node tools/agent-bridge/scripts/check-daemon-target-guard-smoke.js` | 退出码 0，输出 `daemon target guard smoke ok` |
| Bridge 全量检查 | `npm --prefix tools/agent-bridge run check` | 退出码 0；含 target guard、usage、provider、daemon、Git、MCP、schedule/loop/room、R12/R13 和 voice-platform smoke |
| SDK 23 HAP | `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace` | 退出码 0，`BUILD SUCCESSFUL`；仅保留既有 syscap、deprecated 和 throw-handling 警告 |
| 工作区格式检查 | `git diff --check` | 无 diff 错误；仅有既有 LF/CRLF 提示 |

Node.js 严格匹配加固后再次执行 `node --check`、target guard smoke 和
`npm --prefix tools/agent-bridge run check`，均退出码 0。本次没有 ArkTS 变化，未重复
SDK 构建，也没有重复设备安装。

HAP 产物：`entry/build/default/outputs/default/entry-default-signed.hap`，本轮构建时间
为 2026-08-08 20:02:24，大小 14,207,303 bytes。

## 指定设备安装记录

构建成功后只向 `5KLBB25A10203862` 执行了一次覆盖安装：

```powershell
& 'F:\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe' `
  -t '5KLBB25A10203862' install -r `
  'F:\\DevEcoStudioProject\\Coder\\entry\\build\\default\\outputs\\default\\entry-default-signed.hap'
```

HDC 返回 `9568423`：当前签名 profile 未授权该设备 UDID。安装未成功；没有向其他
设备安装，没有启动应用，也没有执行设备端测试。

## 尚未关闭的现场门

- 两个临时 Bridge 的 A/B 聚合、目标身份变化和 rolling restart/update/rollback 现场。
- Windows/Linux/macOS 全局安装、自启重启、权限路径和真实签名远程配置。
- 真机和多主机现场失败只重开对应子步骤，不回退已经通过的 target guard 源码和 smoke。

因此对齐清单第 14 项继续保持“部分实现”，R19 源码子阶段标记为已完成。

## 下一步

优先执行 Fleet 双 Bridge 定向 live smoke；若现场依赖不可用，则继续收口第 16/23D
平台 host 或第 22/34 真实 Provider 生产链的源码与自动化缺口，并把现场依赖单独记录。
