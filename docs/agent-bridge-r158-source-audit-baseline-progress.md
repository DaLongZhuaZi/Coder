# R158 部分实现项源码面复审与全量基线

日期：2026-08-15
状态：已完成（审计轮：确认第 14/16/21/22/33/34/23B/23D 当前源码面无未收口缺口，剩余均为 FIELD/现场验收门）

## 目标

在 R155（Voice AVPlayer）、R156（Fleet App-local availability）、R157（metadata capability gate）之后，对全部"部分实现"项做一次基于当前实际源码的复审，确认没有遗漏的源码级缺口，并记录当前工作区全量验证基线。

## 复审结论（当前源码为准）

| 复审区域 | 文件 | 结论 |
|---|---|---|
| Web 工作台结构 | `tools/agent-bridge/src/web/index.html`、`app.js` | Host/Agents/Workspaces/Conversation/Doctor/Session Experience(queue/usage/provider-usage/metadata)/Git/GitHub/Files/Terminal/Notifications/Services/Browser 全部接线；diagnostics JSON/text 导出、受控 remediation actionId、workspace 文件浏览/受限预览/一次性下载（`safeDownloadUrl` 校验 origin+token）齐全 |
| Web Browser 动作覆盖 | `app.js` | click/fill/type/keypress/hover/select/drag/upload/scroll/download/evaluate 11 类全部提供 |
| MCP/CLI confirm gate | `mcp-host.js`、management CLI | `browser_page_action`/`browser_permission_set`/`browser_instance_close`/`browser_page_close` 要求 confirm；CLI preview→planId→confirm |
| security audit | `security-audit.js`、`server.js` | `recordBrowserAutomationAudit` 只记录 requestType/workspaceId/agentId/hostId/pageId/severity/稳定 failureCategory，不落输入正文、脚本、上传内容或截图 |
| CDP download/upload 边界 | `browser-cdp-host.js`、`browser-automation-manager.js` | 下载目录 marker `.agent-bridge-downloads` 公开、真实路径不出 DTO；upload realpath/workspace 内/单文件 64 MiB/总计 128 MiB/SHA-256/mtime 变化检测 |
| Daemon target guard | `daemon-target-guard.js` | hostProfileId 与认证连接一致、expectedInstanceId/expectedGeneration 校验 |
| nonce 前置校验 | `server.js` | `validateAndRememberNonce` 在 `acceptWebSocket`（101）之前执行，replay/invalid 返回 409/400 并记审计 |
| Voice 页面生命周期 | `NGFAgentHomePage.ets` | `aboutToAppear` 订阅 `setListener`、`aboutToDisappear` 置空并 `release()`，成对 |
| App Browser host readiness | `NGFAgentHomePage.ets` | hostKind/runtime/capabilitySource/readiness/supportedPlatforms 展示 + `AgentHomeBrowserCapabilityPolicy` gate（R36/R127） |
| App usage 数值语义 | `NGFAgentHomePage.ets` | `usageNumberText`/`providerUsageNumberText` 对负数/非有限返回 unavailable 文案；estimated 用 amber 色与文案区分 |
| App Browser 敏感输入 | `NGFAgentHomePage.ets` | `showBrowserActionPreview` 只展示 target summary+warnings，value/text/functionSource 不进确认弹窗 |

## 补充复审（2026-08-15 第二轮）

| 复审区域 | 结论 |
|---|---|
| Web Browser action 输入与确认 | `window.prompt` 收集输入不持久化；confirm 提示只含 action 名与 targetState，不包含 value/text/function 等敏感输入；upload 路径经 `workspaceRelativeBrowserPath` 拒绝绝对路径/`..`；instance/page close 走 preview→confirm |
| App fullPage 截图传递（R151/R152） | `browserScreenshotFullPage` Switch → `requestBrowserScreenshot(fullPage)` → parser 消费，闭环完整 |
| Bridge runtime capability smoke | `check-provider-runtime-capability-smoke.js` 已断言 metadataGeneration/usageEvents/providerUsage 的发布语义（invalid/blocked runtime false、Mock true、runtime method/producer marker 门控、HTTPS endpoint-only providerUsage），支撑 App 端 known 标志语义 |
| App workspace registry | suggestions/records/projects/doctor/import preview 全接线 |
| Hypium 测试注册 | `entry/src/test` 33 个文件（含 List.test.ets）中 32 个测试全部注册到 `List.test.ets`，含 R156 新增 `AgentHomeDaemonFleetAvailabilityPolicy.test.ets` |
| R157 测试补充 | `AgentBridgeM5Parser.test.ets` 增加显式 `metadataGeneration:false`/`usageEvents:false` 断言：known=true 且 supports=false（显式发布必须 fail-closed，不能因缺 known 标志走全局兼容） |

## 补充复审（2026-08-15 第三轮）

| 复审区域 | 结论 |
|---|---|
| App 端文件传输 UI（R48） | `buildRuntimeFileTransferSection` 提供源路径/目标路径/上传/取消/重试与 binary frame 收发；Web 端无 `file.transfer.upload` 入口，但该能力不在 23B 声明范围（alignment 23B 已实现列表仅声明文件浏览/受限预览/一次性下载），不引入新功能 |
| App diagnostics 八组 | `diagnosticsReport.groups` 全部渲染，展开/折叠、checks/remediation/actionId 受控处理齐全 |
| Gateway usage producer | `normalizeGatewayUsage` 覆盖 input/output/reasoning/cache read/write/total/cost/currency，按响应 id 去重、providerEventId 稳定、缺失字段不伪造 |
| 第 22/34 核心 smoke 有效性 | `check:r87`（recorded session replay）、`check:r146`（usage window）、`check:r88`（Web Session Experience + live）本轮全部退出码 0 |
| alignment 文档一致性 | 第 8 节证据索引补齐 R153/R155/R156/R157；总表第 21、33 行结论列移除“AVPlayer 尚需补齐/仍待收口”过时表述，全文档无“尚需补齐/仍待收口”残留；`git diff --check` 退出码 0 |

## 补充复审（2026-08-15 第四轮）

| 复审区域 | 结论 |
|---|---|
| Web/App 功能面对比 | M7 automation（Schedules/Loops/Rooms）、daemon 生命周期管理、provider profiles 在 Web 端无消费入口，但均不在 23B 声明范围（alignment 23B 已实现列表与剩余步骤均未声明），不引入新功能避免范围蔓延 |
| App browser download 展示 | `browserDownloads` 列表 + 状态 + host/workspace 切换清理（R36 声称的下载状态）完整 |
| Web queue cancel/retry | status 门控（queued/sending 可 Cancel，failed 可 Retry）+ `actionInFlight` 防重复提交（R88） |
| security-hardening smoke | `check-security-hardening-smoke.js` 已在 Bridge `check` 链中（长脚本行）且单独运行 `node scripts/check-security-hardening-smoke.js` 退出码 0（认证/host allowlist/nonce/bcrypt/真实 HTTP） |
| Web budget | `usage.budget.get/set`（save/clear/window/currency/warningThreshold）+ warning 事件消费完整 |
| Web usage unavailable 语义 | `displayMetric` 对非有限值返回 unavailable；quota/event/cost 空值显示 unavailable 文案，不显示 0 |

## 补充复审（2026-08-15 第五轮）

| 复审区域 | 结论 |
|---|---|
| Git action 面（第 8 项） | `isBridgeGitActionResult` 识别的 14 个 action（pull/push/branch/create/checkout/switch/delete/stash/list/pop/apply/drop/merge/status）与 App 操作按钮/plan confirm 链一一对应，含 discardWorkspacePaths |
| Worktree action 面 | parser 识别的 worktree.create/archive/list 均有 App 入口与 preview→confirm |
| 第 34 项状态区分 | `availabilityState` 六态（LOADING/UNSUPPORTED/AVAILABLE_EMPTY/FAILED/STALE/AVAILABLE）在 App Provider usage 区各有展示分支，无全零伪装 |
| 协议对称性（脚本对比） | protocol.js 246 个 RequestType 全部被 server.js 引用（无声明未处理）；App client 226 个常量引用全部有效；Web `send()` 65 个类型全部在协议中；73 个 EventType 由 server 主动发送 |
| CLI Browser 命令 | host list、permission get/set、instance list/create/close、page list/create/close/navigate/back/forward/reload/snapshot/screenshot/logs/wait、action 全部接线 |

## 补充复审（2026-08-15 第六轮）

| 复审区域 | 结论 |
|---|---|
| App M7 automation（第 18/19/20 项） | Schedules 管理/历史、Loops 管理/轮次、Chat Rooms 管理/成员/消息面板全部接线，create/update/archive/member add/update/remove 走 preview→confirm |
| Web GitHub 登出 | `github-logout-button` + `github.auth.logout` 已存在（authenticated 门控 + confirm），与 R160 App 端登出对齐 |

## 补充复审（2026-08-15 第七轮）

| 复审区域 | 结论 |
|---|---|
| App/Bridge 未完成标记扫描 | entry 与 tools/agent-bridge 无 TODO/FIXME/未实现代码标记（匹配均为输入占位符、TODO 事件类型与“not implemented”错误文案检测逻辑） |
| 第 34 项显示设置 | 聊天字号 Slider 12–22、代码字号 11–20 经 `ngfSettingsStoreFacade` 持久化并可恢复 |
| module.json5 权限 | 8 项声明覆盖框架实际使用的 5 项（ACCELEROMETER/ACCESS_BIOMETRIC/ACTIVITY_MOTION/DETECT_GESTURE/MICROPHONE）+ INTERNET |
| 框架 i18n | 28 个 app.string 引用中 27 个 about_* 定义于框架自有资源、my_key 为注释示例；R162 补齐 zh_CN 后两模块三份资源全部对齐 |
| FIELD 验收清单 | 新增 `docs/agent-bridge-field-acceptance-checklist.md` 聚合全部现场门与通过标准 |

## 补充复审（2026-08-15 第八轮）

| 复审区域 | 结论 |
|---|---|
| 协议对齐 smoke | `node scripts/check-protocol-alignment-smoke.js` 本轮退出码 0 |
| rawfile 配置 | entry 无 rawfile 配置（目录为空），无待检查项 |
| host 切换统一清理 | `clearHostRuntimeState()` 完整清理 Git plan/Voice（request/playback/result）/Bridge 连接/workspace/session/messages/terminal/file transfer/Browser（permission/hosts/instances/pages）/daemon/notifications/providers；Fleet 状态按 R156 App-local 设计跨 host 保持（不误清） |
| App usage 窗口 | session/day/month 按钮切换、预算窗口独立 draft、事件列表按窗口键隔离，与 Web R146 对齐 |
| 协议对齐 smoke 有效性 | `check-protocol-alignment-smoke.js` 已纳入 Bridge 全量 check（precheck/check 链） |

## 补充复审（2026-08-15 第九轮）

| 复审区域 | 结论 |
|---|---|
| Voice 核心 smoke | `check:r121`（TTS lifecycle）、`check:r130`（STT cancellation + voice manager）本轮全部退出码 0 |
| App Voice 编辑确认链 | `confirmVoiceTranscript()` 把确认文本追加到主发送草稿 `draftText`，不绕过原有发送确认与队列；partial/final 状态与 pending 门控完整 |
| Web permission 状态清理 | R159 的 `refreshBrowserPermission` 在 feature/workspace 不可见分支清空状态，host/workspace 切换经 refreshIsCurrent 校验后重取 |

## 补充复审（2026-08-15 第十轮）

| 复审区域 | 结论 |
|---|---|
| daemon remote config URL 校验 | App 端只校验非空，URL 的 HTTPS/凭证/重定向校验由 Bridge 端权威执行（R17/R32），client 直发 `DAEMON_CONFIG_FETCH` 合理 |
| 本机构建事实 | `.local-rules/build-commands.local.md` 记录 2026-08-15 连续五次 SDK 23 构建全部退出码 0（R155/R156/R157/R160/R162 的 HAP 大小与 SHA-256） |

## 补充复审（2026-08-15 第十一轮）

| 复审区域 | 结论 |
|---|---|
| App diagnostics action allowlist（第 34 项） | `AgentHomeDiagnosticsActionPolicy` 的 8 个受控 actionId（open_daemon/provider/terminal/usage/secure_storage、review_message_queue、refresh_remote_config、repair_persistence）normalize/isAllowed/targetForAction 完整 |
| Web diagnostics action allowlist | `DIAGNOSTIC_ACTIONS` 与 App 端 8 个 actionId 完全一致；两组（daemon/provider/terminal/queue/usage/secureStorage/remoteConfig/persistence）一致 |

## 补充复审（2026-08-15 第十二轮）

| 复审区域 | 结论 |
|---|---|
| Web service open ticket（23C） | `openService` 走 preview→confirm→一次性 `accessUrl`（`safeServiceAccessUrl` 校验同 origin/无凭证/http(s)）→ `window.open(noopener)`；WebSocket ticket 经 `openTicket()`（Origin + Bearer + HttpOnly session）获取 |
| App service open（23C） | `previewWorkspaceServiceOpen` → confirm → `openWorkspaceServiceAccessUrl`（safeUrl 校验）→ openExternalLink，与 Web 对齐 |

## 补充复审（2026-08-15 第十三轮）

| 复审区域 | 结论 |
|---|---|
| daemon supervisor live smoke（第 14 项） | `node scripts/check-daemon-supervisor-live-smoke.js` 本轮退出码 0（supervisor 双层进程、owner lock、IPC ready/heartbeat、平滑替换）；该 smoke 在 Bridge `check` 链中 |
| Browser 全套 smoke（第 16/23D 项） | `check:browser` 本轮退出码 0（manager、event scope、CDP host、live automation、protocol alignment 全部通过） |

## 补充复审（2026-08-15 第十四轮）

| 复审区域 | 结论 |
|---|---|
| remote config live smoke（第 14 项） | `check:daemon-remote-config-host-scope-live` 本轮退出码 0（真实 WebSocket host scope、跨 host apply/rollback 阻断） |
| GitHub host scope live（第 9 项） | `check:github-host-scope-live` 本轮退出码 0（OAuth poll、PR plan、watch stop、断线清理） |
| App provider profile secret 边界（第 7 项） | env 提供时要求 `providerSecretStorage` feature gate，env 对象解析校验后发送 Bridge（profile schema v2 分离公开配置与 secret 引用） |

## 补充复审（2026-08-15 第十五轮）

| 复审区域 | 结论 |
|---|---|
| remote config state smoke（第 14 项） | `check:r32` 本轮退出码 0（schema v1、启动 reconcile、摘要漂移/损坏 previous 回滚 guard、state_persist_failed） |
| MCP/CLI live smoke | `check:r58` 本轮退出码 0（management CLI live、MCP live：live_bridge_required、confirm gate） |
| App relay 配对（第 17 项） | 配对 offer/二维码/用户码/复制/取消/过期定时器、设备列表/撤销、pairing 状态机完整 |

## 补充复审（2026-08-15 第十六轮）

| 复审区域 | 结论 |
|---|---|
| usage/metadata live smoke（第 22/34 项） | `check:r28` 本轮退出码 0（Mock Provider 驱动 WebSocket live、host scope、budget warning、四类 metadata） |
| Web multi-tab scope（23B） | `check:r65` 本轮退出码 0（BroadcastChannel endpoint/host/scope 过滤、局部刷新） |
| metadata provider cleanup（第 22/34 项） | `check:r144` 本轮退出码 0（取消/timeout/断线触发 Provider cleanup、迟到结果丢弃） |
| App notification（第 13 项） | 点击路由（@StorageLink tap action/payload + sequence 消费防重复）、本地通知发布（running/waiting/completed/interrupted/error/plan/permission/request）、Bridge 列表与已读标记完整 |

## 补充复审（2026-08-15 第十七轮）

| 复审区域 | 结论 |
|---|---|
| Voice retention smoke（第 21/33 项） | `check:r150` 本轮退出码 0（隐私状态 policy/source/duration 边界、敏感 endpoint/token 不泄露） |
| Voice single playback（第 21/33 项） | `check:r153` 本轮退出码 0（双交付单次播放） |
| Voice TTS lifecycle（第 21/33 项） | `check:r121` 本轮退出码 0（request/playback 状态机） |
| App terminal（第 25 项） | mouse mode（OFF/CLICK/DRAG/ALL/SGR）、hook 状态、session ready 门控完整；renderer 测试已注册 `List.test.ets` |

## 补充复审（2026-08-15 第十八轮）

| 复审区域 | 结论 |
|---|---|
| Bridge 全量基线 | `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 本轮退出码 0（precheck/check/postcheck 全部 smoke，含 check:r155），工作区基线全绿 |
| Web diff 分页（R147） | `loadDiffPage(append)`、truncated/truncationReason、`diff-more-button` 继续加载、缓存 cursor 完整 |

## 补充复审（2026-08-15 第十九轮）

| 复审区域 | 结论 |
|---|---|
| App composer token/mention（第 28 项） | `composerTokens` 状态、`AgentHomeCommandRegistry` 过滤/快捷键/命令面板、mention 解析（chat room member）、发送时携带 tokens 并清理 |
| App workspace 文件路径安全（第 11/26 项） | `normalizeWorkspaceFilePath`/browser upload policy 归一化、下载进受限本地目录、attachment 预览缓存目录；Bridge 端 realpath 校验兜底 |

## 补充复审（2026-08-15 第二十轮）

| 复审区域 | 结论 |
|---|---|
| App 系统符号有效性 | 提取 entry 全部 78 个 `$r('sys.symbol.*')` 引用与 SDK `id_defined.json` 对比，0 缺失，全部有效 |

## 补充复审（2026-08-15 第二十一轮）

| 复审区域 | 结论 |
|---|---|
| rich content（第 27 项） | App 端 `NGFRichContentRenderer` + link index + kind 判定 + 渲染定时器；Web 端 `richContentAst` capability gate + rich-content 渲染，两端对称 |
| Web workspace registry import（R11） | `importWorkspace` 走 preview→confirm，旧 Bridge 缺 import RPC 时 fallback `workspace.registry.create` |

## 补充复审（2026-08-15 第二十二轮）

| 复审区域 | 结论 |
|---|---|
| App daemon autostart（第 14 项） | preview/install/uninstall 带 confirm gate、状态/注册 id/目标路径/警告/预览 JSON 展示完整 |
| Web terminal V2 输入（R148） | `sendTerminalInput` 走 `TerminalStreamOpcode.INPUT` binary frame + slot 门控；resize rows/cols 2–500 范围校验 |

## 补充复审（2026-08-15 第二十三轮）

| 复审区域 | 结论 |
|---|---|
| App daemon update（第 14 项） | check/preview/install/rollback 带 confirm gate；current/target version、integrity、installation kind、pending restart、backup、replacement、failure 展示完整 |
| App host credential store（第 29 项） | AssetStoreKit 安全存储、随机 alias、SHA-256 digest 记录、读写删除；Fleet 连接池按 profile 短暂读取后释放 |

## 补充复审（2026-08-15 第二十四轮）

| 复审区域 | 结论 |
|---|---|
| Web browser 截图清理（R116） | host/page 切换、断线、feature 关闭、page 消失路径全部 clearBrowserScreenshot；页面/实例/列表不匹配时清理 |
| workspace Git plan（R142） | planId 一次性消费、snapshot 绑定 + digest、confirm 时 snapshot digest 校验（staged paths/仓库快照/消息摘要） |

## 补充复审（2026-08-15 第二十五轮）

| 复审区域 | 结论 |
|---|---|
| App Session Window（第 24 项） | `AgentHomeSessionWindowCoordinator` planOpen/markOpened/markClosed、lifecycle observer 处理销毁、host 切换/删除/relay 配对时关闭窗口并释放 runtime registry |

## 补充复审（2026-08-15 第二十六轮）

| 复审区域 | 结论 |
|---|---|
| App VisibleScopeCoordinator（第 24/28 项） | resolve/begin/complete 刷新计划与 host epoch 绑定，迟到刷新不覆盖 |
| Web notification（第 31 项） | list/read/action 消费，open action 需 confirm；`notification.updated` 事件驱动刷新 |
| FIELD 清单引用 | alignment 第 7 节交付与验收规则新增指向 `docs/agent-bridge-field-acceptance-checklist.md` 的引用，现场通过前条目一律保持“部分实现” |

## 补充复审（2026-08-15 第二十七轮）

| 复审区域 | 结论 |
|---|---|
| 文档一致性 | alignment 顶部证据（R155/R156/R157/R159/R160）与 continuation 顶部（FIELD/R162/R161/R160/R159/R158）与各 R 文档（R155-R162 全部存在）一致；资源维护轮与审计轮不进入 alignment 顶部证据属合理设计 |

## 补充复审（2026-08-15 第二十八轮）

| 复审区域 | 结论 |
|---|---|
| App Workbench 布局（第 35 项） | compact/medium/expanded 三档 + 快捷键（Alt+3 等）+ NavigationMode 联动 + `constraintSize` 分栏 |
| App checkpoint（第 3 项） | create/restore 带 dry-run/confirm、files/manifest 提示、runtimeRestore、file checkpoints capability gate |

## 补充复审（2026-08-15 第二十九轮）

| 复审区域 | 结论 |
|---|---|
| App agent 关系体系（第 2 项） | 关系面板（parent/root/children/depth/detached/fork source/checkpoint/warnings）+ fork shared/isolated 模式选择 + preview→confirm |
| Web terminal V2 restore（R148） | `terminal-stream-state.js` restoreSeq/snapshotSeq 单调校验、陈旧帧拒绝、awaitingRestore 门控、手动 snapshot 按钮 |

## 补充复审（2026-08-15 第三十轮）

| 复审区域 | 结论 |
|---|---|
| Bridge 全量基线（第 37 轮） | `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 退出码 0，工作区基线持续全绿 |
| 设备状态 | `hdc list targets` 仅两个网络设备，目标 `5KLBB25A10203862` 离线；FIELD 安装条件不可用，未安装/操作任何设备 |

## 补充复审（2026-08-15 第三十一轮）

| 复审区域 | 结论 |
|---|---|
| alignment 部分实现行完整性 | 8 个“部分实现”行中 7 行含 R155-R162 近期证据；第 16 行保持 R127 等历史证据（本轮无直接改动，R159 的 permission 状态归属 23B/23D），表述一致无遗漏 |

## 自动化证据

- Bridge 全量 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`：退出码 0（含 precheck/check/postcheck 全部 smoke，postcheck 实际执行并通过 `check:r155`），Docker runtime 按 opt-in 规则跳过。
- `check:r155`、`check:r152`、`check:r116`、`check:r87`、`check:r146`、`check:r88`、`check:daemon-fleet-live`、`node scripts/check-security-hardening-smoke.js` 定向 smoke 本轮全部退出码 0。
- 本轮仅扩展 Hypium 测试断言与维护文档（`AgentBridgeM5Parser.test.ets`、`agent-bridge-paseo-alignment.md`），未修改产品 ArkTS 与 Node 代码；SDK 23 HAP 无需重新构建（R157 构建证据 14,545,893 bytes / SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2` 保持有效）。

## 未关闭的门

- 全部"部分实现"项（14、16、21、22、33、34、23B、23D）的剩余缺口均为 FIELD：真机音频/权限/蓝牙/来电、真实 Provider quota/metadata/长会话、受支持平台 Browser host、恶意页面/登录态、真实上传下载、跨平台 daemon 安装/自启/双 Bridge rolling、真实旧 Bridge 多标签长流。未伪造为已通过。
- 本轮未安装、启动或测试设备。
