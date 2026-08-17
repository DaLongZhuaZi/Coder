# Agent Bridge R1 落实进度

> 范围：Provider profile 安全边界、受管 Provider 目录生命周期、CDP 调试目标二次校验。  
> 依据：`docs/agent-bridge-paseo-alignment.md` 的 R1 计划。  
> 记录规则：只记录本次实际完成的代码、命令和结果；未执行的项保持“未开始”。

## 当前状态

| 工作包 | 状态 | 目标 | 本次证据 |
|---|---|---|---|
| R1-A Provider profile 公开/私密边界 | 已完成 | secret store、公开 DTO、兼容迁移与 CLI/MCP 收口 | 2026-07-30：Windows DPAPI 实测、定向安全 smoke、CLI/MCP host/live 与协议对齐 smoke 通过。 |
| R1-B 受管目录生命周期 | 已完成 | 一次性计划、所有权、rollback/remove/reconcile | 2026-07-30：Provider directory lifecycle、协议对齐、MCP host/live、CLI host/live、Provider profile security 与 agent experience smoke 通过。 |
| R1-C CDP target 二次校验 | 已完成 | 约束 `/json/list` 返回的 WebSocket URL | 2026-07-30：Browser manager/CDP/live 与协议对齐定向套件通过。 |
| R1-D 协议、回归与文档 | 已完成 | 真实 check 接线与证据收口 | 2026-07-30：Bridge 全量 `npm run check` 退出码 0；SDK 23 HAP 构建成功；进度、对齐清单、架构说明与 README 已按当前事实收口。 |

## R1-A 执行清单

- [x] 复核 `provider-directory-manager.js`、`daemon-store.js`、`server.js`、CLI/MCP 与现有 smoke。
- [x] 定义并实现独立 `ProviderSecretStore`。
- [x] 将 profile 持久化升级为版本化公开配置与 secret 引用。
- [x] 迁移旧明文 env，secure store 不可用时降级为受控状态。
- [x] 运行时只解析私密值，所有响应改为公开 DTO。
- [x] 收口 CLI/MCP 的 profile/env 写入路径。
- [x] 增加泄漏扫描、迁移、keep/set/remove 和 unavailable 测试。

## R1-A 完成事实

- `providers/profiles.json` 新写入使用 `schemaVersion: 2` wrapper；旧数组格式继续读取并可迁移。
- Provider secret 使用独立 service/alias namespace；Windows 使用 CurrentUser DPAPI，明文通过标准输入进入保护进程。
- Profile 公开响应只包含 `envMetadata`、安全存储状态与运行时诊断，不返回 env value 或 secret alias。
- CLI 的 directory/list/discover/import/upsert/clone/env/delete/test 均要求 live Bridge；MCP upsert 使用 confirm guard。
- doctor 与 diagnostics export 已纳入 Provider secret store 状态，输出仅包含 available/platform/remediation。
- Provider test command 使用运行时解析后的 env，但 stdout/stderr 会按实际 secret value 和诊断规则脱敏。

## R1-B 执行清单

- [x] 将 Provider directory state 升级为 `schemaVersion: 2` 与 generation。
- [x] 从 state 与公开 DTO 中移除完整 profile、env 和内部安装 entryPath。
- [x] 为 install、rollback、remove 建立安全随机、短 TTL、一次性 plan。
- [x] 将 plan 绑定 provider/profile、state digest/generation、版本、目录/包摘要、平台和架构。
- [x] rollback 使用 state 的 version + entryPath 重建入口并执行 realpath、digest 与 runtime test。
- [x] remove 只允许 manager state 登记的受管 profile 和目录。
- [x] Bridge 启动执行离线 reconcile，不联网修复。
- [x] reconcile 检查 active entry、profile ownership、目录摘要、runtime 和 secret/environment 引用。
- [x] App rollback/remove 完成 preview → planId → confirm，并区分 remove 与 install 分派。
- [x] CLI/MCP planId 映射、confirm guard 与协议对齐测试完成。
- [x] 增加重复/过期/stale/restart plan、普通 profile、路径逃逸、symlink、activation failure、cleanup warning 和 reconcile 测试。

## R1-B 完成事实

- 受管 state 只保存 ownership、current/previous version、相对 entryPath、package/profile/directory digest、健康状态和 generation；旧 state 会迁移且不保留完整 profile/env。
- status/list 使用公开 DTO，不返回 profile、env、受管 binary 绝对路径、包下载地址或 manifest entryPath。
- install、rollback、remove 的 confirm 必须使用同一进程内 preview 返回的 planId；plan 一次性消费，过期、重复、状态变化或 Bridge 重启后失效。
- install 激活失败、rollback runtime 失败和 state 写入失败均恢复原 profile/runtime/state；清理旧版本失败仅返回 warning。
- rollback 只从受管 state 重建目标 binary，并通过 realpath、目录 ownership、entryPath 与 directory digest 校验。
- remove 从 manager state 反查 ownership；普通 profile、state 外路径和 symlink 逃逸不会删除磁盘内容。
- Bridge 启动在 profile runtime 注册后执行离线 reconcile；缺失 secret/process environment、入口篡改或 ownership 异常会标记 degraded，不触发联网下载。
- App parser 同时支持 catalog list 与 directory status 的公开 state；Rollback/Remove 确认会原样回传 preview planId 和正确 provider/profile 标识。

## R1-C 执行清单

- [x] 抽取 `validateDebuggerWebSocketUrl(baseEndpoint, debuggerUrl, allowRemote)`。
- [x] session 连接 `/json/list` target 前执行二次校验。
- [x] 拒绝 embedded credential、非 `ws:`/`wss:` 和 fragment。
- [x] 将 debugger host/port 严格绑定到已验证 CDP base endpoint。
- [x] 默认模式拒绝非 loopback debugger target。
- [x] 远程 CDP 要求 HTTPS base 与 WSS debugger target。
- [x] 拒绝 HTTPS → WS 降级和远程 endpoint → 私网/其他 host 跳转。
- [x] 增加真实 `/json/list` 恶意 port target 的连接前阻断测试。

## R1-C 完成事实

- `BrowserCdpHost.session()` 不再直接信任 target 的 `webSocketDebuggerUrl`，校验通过后才创建 `CdpSession`。
- 本地模式只允许与 base endpoint 完全一致的 loopback host/port；`localhost`、`127.0.0.1` 或其他 loopback 地址之间的改写不会被默认为同一 authority。
- 远程模式继续由显式 `allowRemoteCdp` 开启，base 必须是 HTTPS，debugger URL 必须是同 host/port 的 WSS。
- `/json/list` 中指向不同端口、外部 host、私网地址、带凭证或发生 TLS 降级的 URL 会在 WebSocket 建连前失败。

## R1-D 执行清单

- [x] 将 Provider profile security、Provider directory lifecycle 和 Browser CDP smoke 纳入 Bridge 全量检查链。
- [x] 执行 Bridge 全量 `npm --prefix tools/agent-bridge run check`。
- [x] 执行 SDK 23 `assembleHap --no-daemon --stacktrace`。
- [x] 更新 R1 进度、Paseo 对齐清单、架构说明和 Bridge README。
- [x] 将第 6、7 项按真实闭环改为“已实现”。
- [x] 更新第 16 项的 R1 安全事实，同时保留 R7 Browser action/host 边界关闭条件。

## R1-D 完成事实

- Bridge 全量检查已覆盖 Provider profile 明文迁移与泄漏扫描、受管目录 plan/ownership/reconcile、CLI/MCP live 映射、协议对齐和 CDP debugger target 二次校验。
- SDK 23 HAP 构建在当前工作区成功完成，仅保留既有 syscap 与 throw handling 警告，没有新增 ArkTS 阻断错误。
- 对齐清单第 6、7 项已具备协议、Bridge、CLI/MCP、App 与自动化闭环，可关闭源码实现状态。
- 第 16 项中的 Provider secret、目录 ownership/plan 和 CDP authority binding 已关闭；Browser action 级 capability、平台 host 与完整 App/Web 操作仍归 R7，故第 16 项整体继续保持“部分实现”。

## 本次实际检查

- `provider-directory-manager.js`：state、plan、rollback/remove ownership 与启动 reconcile 已完成 R1-B 收口。
- `daemon-store.js` / `provider-profile-service.js`：Provider profile 已使用公开配置与 secret 引用分离结构。
- `server.js`：Provider runtime test 会把 secret/process environment 解析失败传播为稳定失败类别。
- `browser-cdp-host.js`：`session(pageId)` 已对 `/json/list` 的 `webSocketDebuggerUrl` 执行 base authority、协议和远程策略二次校验。

## 验收记录

| 日期 | 操作 | 结果 | 证据 |
|---|---|---|---|
| 2026-07-30 | 静态源码复核 | 通过 | 本文件“本次实际检查”与对齐清单 R1。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-provider-profile-security-smoke.js` | 通过 | 明文迁移、不可用降级、Windows DPAPI、公开 DTO、运行时解析、keep/set/remove、clone/delete、doctor/diagnostics、CLI/MCP 门禁。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-agent-experience-smoke.js` | 通过 | diagnostics 分组、脱敏和大小限制回归。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js` | 通过 | Provider 请求、事件与协议常量对齐。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-mcp-host-smoke.js` | 通过 | MCP schema、风险元数据和映射回归。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-mcp-live-smoke.js` | 通过 | MCP confirm、Provider secret 写入/list/diagnostics 泄漏扫描与 Bridge 日志扫描。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-management-cli-smoke.js` | 通过 | 无 live Bridge 时 Provider 管理返回 `live_bridge_required`，本地 store 零写入。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-management-cli-live-smoke.js` | 通过 | CLI live upsert/env/list/test；测试进程可读取 secret，RPC 输出保持脱敏。 |
| 2026-07-30 | 相关 Node 源码与 smoke `node --check` | 通过 | `server.js`、`provider-secret-store.js`、`provider-profile-service.js`、`daemon-store.js`、`diagnostics.js`、`desktop-launcher.js`、`mcp-host.js`。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-provider-directory-smoke.js` | 通过 | install/rollback/remove 一次性 plan、state v2、公开 DTO、activation/state 恢复、所有权、路径逃逸、symlink、旧版本清理、warning、重启失效与离线 reconcile。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js` | 通过 | Provider directory Request/Event、server、CLI、MCP、App payload/client/parser/UI planId 闭环。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-mcp-host-smoke.js` | 通过 | Provider directory 工具定义、风险元数据、planId schema 与 RPC 映射。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-mcp-live-smoke.js` | 通过 | Bridge 启动、Provider secret/process environment 失败传播、MCP live 与脱敏回归。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-management-cli-smoke.js` | 通过 | 无 live Bridge 的 Provider 管理门禁回归。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-management-cli-live-smoke.js` | 通过 | CLI live Bridge 映射与 Provider 管理回归。 |
| 2026-07-30 | `node tools/agent-bridge/scripts/check-agent-experience-smoke.js` | 通过 | diagnostics 分组、脱敏和大小限制回归。 |
| 2026-07-30 | R1-B 相关 Node 源码与 smoke `node --check` | 通过 | `server.js`、`provider-directory-manager.js`、Provider directory/protocol/MCP live smoke。 |
| 2026-07-30 | `npm --prefix tools/agent-bridge run check:browser` | 通过 | Browser manager、CDP host、Browser live、协议对齐与相关 Node 语法检查。 |
| 2026-07-30 | `npm --prefix tools/agent-bridge run check` | 通过 | 全量 precheck 与主检查退出码 0；Provider profile security、Provider directory、Browser CDP、MCP/CLI live 和 protocol alignment 均通过。 |
| 2026-07-30 | `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace` | 通过 | `BUILD SUCCESSFUL in 38 s 798 ms`；仅保留既有 syscap 与 throw handling 警告，无新增 ArkTS 阻断错误。 |

## 现场验收保留项

- HarmonyOS 真机与真实远程 Provider catalog：属于现场验收，不替代源码自动化。
- macOS Keychain、Linux Secret Service 和跨平台真实 Provider 包安装：保留为现场证据，不影响 R1 源码状态关闭。
