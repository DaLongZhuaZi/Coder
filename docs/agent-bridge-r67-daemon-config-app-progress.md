# R67 Daemon 远程配置 App 闭环

## 目标

在已有签名远程配置 manager、Bridge RPC、CLI/MCP 和多主机 daemon coordinator 之上，补齐 App 远程配置面板的可见状态与安全操作闭环。R67 不改变远程配置签名、下载或持久化规则，也不替代跨平台 daemon 和双 Bridge 现场验收。

## 范围

- [x] `AgentBridgeDaemonConfigResult` 解析 active、previous、fetched、摘要、验证、降级、作用域、覆盖字段和更新时间；缺字段保持安全默认值。
- [x] `AgentBridgeClient` 的 daemon config status/fetch/validate/preview/apply/rollback 方法支持可选 `hostProfileId`，保持旧调用兼容。
- [x] App 远程配置区增加状态、验证、回滚入口和当前版本/上一版本/已获取版本展示。
- [x] Fetch、Validate、Preview、Apply、Rollback 在请求期间禁用重复操作；发送失败恢复可操作状态。
- [x] Preview 使用版本、作用域、摘要、被本地覆盖字段和重启要求生成确认内容；取消不会触发写操作。
- [x] 来源只显示“已配置（地址已隐藏）/未配置”，不在 UI 展示远程 URL 查询参数。
- [x] 成功应用或回滚后自动刷新状态；失败展示结构化 failureCategory/message/remediation。
- [x] 新增中英文资源并复用现有 HDS/AlertDialog 样式。
- [x] 增加 App parser 定向测试，覆盖新字段和旧 Bridge 缺字段默认值。

## 验证记录

| 检查 | 状态 | 证据 |
|---|---|---|
| App parser 定向测试 | 已接入，未单独运行 | `entry/src/test/AgentBridgeIncomingParser.test.ets` 已覆盖新字段与旧字段默认值；本轮没有执行设备/Hypium 测试 |
| ArkTS 静态/编译复核 | 通过 | `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`，`BUILD SUCCESSFUL in 38 s 622 ms` |
| HAP 摘要 | 已记录 | `entry/build/default/outputs/default/entry-default-signed.hap`，14,346,903 bytes，SHA-256 `B16CCBA3A950C71665B28E257EAAF8195D6CF4C43635C1D1D0A958791D75370F` |
| 设备安装 | 未执行 | `5KLBB25A10203862` 当前为 `Offline`；未向该设备或任何其他设备安装 |

## 仍待现场验收

- Windows/Linux/macOS 真实签名配置、自启重启和多 Bridge rolling。
- 旧 Bridge/新 App 与真实远程配置 endpoint 的现场兼容矩阵。
