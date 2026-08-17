# Agent Bridge App 架构启动方案

## Metadata turn cleanup

Provider metadata 生成使用短生命周期、受 scope 绑定的临时 turn。Bridge request state 可选保存一次性 `cancelMetadata` cleanup hook；取消、超时或连接断开先标记请求并触发 hook，迟到 Provider 结果不能回写 RPC、usage 或页面。Codex App Server 的 metadata thread/turn 在 request id 绑定下 best-effort interrupt/archive，随后清理本地 session、message 和 usage 快照；不支持 hook 的旧 Provider 保持兼容并由 Bridge 的 detached/responseSent gate 丢弃迟到结果。

## Web rich content gate

Web 端只有在 Bridge capability `richContentAst` 明确为 true 时才消费消息 `contentNodes`；旧 Bridge 继续使用原始 text/content。AST parser 对节点、字段、URL、路径和代码大小执行有界归一化，节点超过上限时保留带 `node_limit` 原因的 fallback，避免把安全截断误认为完整内容。

## Web terminal V2 sequence gate

Web Terminal V2 的 NGF2 restore frame 包含 `restoreSeq`、`snapshotSeq`、truncated 和 source。`terminal-stream-state.js` 在订阅、重连、手动 snapshot、unsubscribe 和 socket shutdown 时维护独立 stream epoch：V2 output delta 在权威 restore 到达前不追加，重复或更旧的 restore/snapshot 不得覆盖当前输出，更高序列才会替换缓存。V1 legacy 文本帧继续兼容，但不宣称具备序列去重能力。状态模块与 `app.js` 分离并由 Web contract/smoke 测试，避免页面将 restore metadata 当作普通正文处理。

## Provider 安全与受管目录

Provider profile 使用版本化公开配置与私密值分离结构。公开 profile 只保存 endpoint、binary、runtimeMode、启用状态，以及 env key/source/configured/fingerprint 等元数据；secret value 通过独立 `ProviderSecretStore` 保存，或显式引用进程环境变量。旧明文 env 在启动时执行幂等迁移；安全存储不可用时 profile 标记 degraded，RPC、CLI/MCP、doctor、diagnostics 和日志仍不得回显明文。Windows adapter 使用 CurrentUser DPAPI，macOS/Linux 分别预留 Keychain 与 Secret Service；不同凭证域使用独立 service/alias namespace。

框架的 `EncryptedSettingsStoreFacade` 与 Provider/Host credential store 使用同一安全边界：主密钥通过 `ngfKeyStoreManagerFacade` 写入 AssetStoreKit 的稳定 alias，普通 AppStorage 只保留历史迁移标记，不再写入新的主密钥。启动时先读取安全 alias；发现旧 AppStorage 密钥时，仅在安全写入成功后完成一次迁移并清空旧值。AssetStore 不可用、随机数生成失败或迁移失败时返回 `secure_storage_unavailable`，加密设置读写 fail closed，不使用固定静态 fallback key。`getStatus()` 只公开 ready、存储类型和稳定失败类别，不公开密钥或安全存储内部路径。

受管 Provider 目录的持久 state 使用 schema v2 与 generation，只记录 provider/profile ownership、current/previous version、相对 entryPath、package/profile/directory digest 和健康状态，不保存完整 profile、env、绝对 binary 路径或下载地址。公开 list/status 由独立 DTO 构造。install、rollback、remove 固定为 preview → confirm，计划使用安全随机 id、短 TTL 和一次性消费，并绑定 provider/profile、state generation/digest、版本、包/目录摘要、平台和架构。

Rollback 只从 manager state 的 version + entryPath 重建入口，并依次验证 archive-safe path、realpath、受管目录 ownership、directory digest 和 Provider runtime；失败恢复原 profile/runtime/state。Remove 先反查 manager ownership，普通 profile、state 外目录和 symlink 逃逸不会触达磁盘。Bridge 启动在 runtime 注册后执行离线 reconcile，检查 active/previous entry、profile ownership、secret/environment 引用、摘要和 runtime；异常只标记 degraded，不自动联网修复。

## Git 高风险写操作

Workspace Git destructive 操作由 `WorkspaceGitPlanManager` 统一授权。Bridge 在 preview 阶段建立只读 repository snapshot，绑定 workspaceId、repository realpath、HEAD、branch/upstream、index/worktree fingerprint、规范化请求和短期一次性 planId；结果包含 affected/untracked paths、目标 ref、remote、ahead/behind、冲突可能性、force/overwrite 风险及受控参数。discard、pull、force push、branch delete、stash pop/drop 和 merge 在没有匹配的 `planId + confirm` 时不会执行。

确认会重新计算 snapshot 并消费 plan。请求、仓库状态、upstream 或 Bridge generation 变化返回 `git_plan_stale`；缺失、过期、重复消费或 Bridge 重启后的 plan 返回 `git_plan_expired`。force push 仅使用 `--force-with-lease`。CLI、MCP 和 App 共享该 Bridge 门禁，App 只在 `gitOperationPlans` capability 开启且 Bridge 已可信时展示高风险按钮；确认成功后只刷新当前 workspace 的 Git scope。

## Agent Experience 层

M5 在既有消息、agent、workspace 和 terminal 协议之上增加可选体验层，不建立平行后端。Bridge 负责内容规范化、持久幂等、用量聚合、诊断脱敏和 fork 边界校验；App 负责安全二次校验、能力门控、可见范围编排和窗口生命周期。所有新增字段均为 optional，App 按 host profile、host epoch、workspace 和 session 隔离状态；旧 Bridge 缺少 capability 时继续使用原有文本聊天和导航。

### Canonical Rich Content

Canonical rich-content AST 支持 `text`、`code`、`link`、`file`、`tool`、`todo`、`diff`、`warning` 和 `fallback`。`normalizeRichContentNodes()` 同时处理 Provider AST 和 Bridge 生成节点，并统一实施以下边界：

- 每条消息最多 100 个节点，正文、代码和字段分别受 UTF-8 字节与行数限制，tokenizer 最多生成 4096 个 token。
- ArkTS/TypeScript/JavaScript、JSON/JSON5、Shell 和 Diff/Patch 使用内置轻量 tokenizer；未知语言、tokenizer 失败或超限内容降级为安全纯文本，并保留截断原因。
- tool node 归类为 file、shell、Git、GitHub、checkpoint、terminal、permission、plan 或 fallback；todo 和 diff 保持独立结构，不从普通文本推断 todo 状态。
- link node 只接受 HTTP/HTTPS 且拒绝内嵌 username/password；file node 必须携带匹配 workspace identity 的安全相对路径。

Streaming delta 只推进合并正文，不生成权威 AST。Provider turn 完成或 timeline projection 恢复时，Bridge 基于合并后的完整消息生成 canonical AST 并持久化。App parser 和 rich-content policy 再次检查 URL、控制字符、绝对路径、盘符、`..`、workspace mismatch 和非法行号，然后才允许打开资源。

### Durable Fork、队列与 Metadata

Session message queue 使用 `clientMessageId` 跨重连和 daemon 重启去重，公开 queued、sending、accepted、failed、cancelled 状态以及 list、cancel、retry 操作。持久状态 schema v2 另外保存最多 20 条受限 attempt history；首次发送创建新的 `attemptId`，失败 retry 保留原 `queueId`/`clientMessageId` 并创建带 `retryOfAttemptId` 的新 attempt，accepted/cancelled/failed 会更新当前 attempt 的状态和时间。旧 v1 条目在首次读取时幂等迁移，旧 App 缺少 attempt 字段时仍按既有 attempts 数字和状态工作。Composer token 是强类型 text、slash、workspace、file、agent、attachment 节点；Bridge 不信任 App 传入的 scope，会重新检查 host/workspace identity 和文件路径。

消息级 fork 要求 completed assistant turn 具有 durable `boundaryMessageId`、`timelineEpoch` 和 `timelineSeq`，不能从历史文本猜测边界。流程固定为 preview → confirm：

- Preview 生成短期 `forkPlanId`，并绑定源 agent、权威 boundary cursor、`contextDigest`、workspace mode 和 expiry。
- Confirm 重新检查 cursor、digest、source agent 状态和 plan 是否已消费；任何状态漂移都会使计划失效。
- Fork context 只保留边界前的 user/assistant 消息和脱敏 tool summary，排除 reasoning、credential、外部工具原始输入和边界后的消息。
- Child 首次发送通过现有 context item 注入一次 chat-history attachment；持久化 consumed 状态保证失败重试不会重复注入。

Fork 支持 shared 与 isolated workspace。`metadata.generate` 则使用当前会话 Provider 的独立 metadata turn，生成 session title、branch、commit 或 PR 建议；结果只作为可编辑 preview，不污染主 timeline。应用建议必须继续调用现有 scope/plan RPC：session title 走 `agent.update`，branch 走 `workspace.git.branch` 的 preview/confirm，commit 走显式 `workspace.git.commit` plan gate，PR 走 `github.pr.create` dry-run/confirm，metadata service 本身不直接写工作区或远程 Git 状态。Bridge 在调用前校验 session、agent、provider、providerSession、workspace 和当前连接 hostProfileId；显式未知 kind 返回 `metadata_kind_invalid`，缺失 kind 才兼容默认为 `sessionTitle`。发送给 Provider 的 payload 只包含受绑定 workspace 路径、kind、用户目标、受限 timeline/diff 摘要和模型字段，并对 token/password/secret/authorization/private key 做脱敏。`normalizeMetadataResult()` 统一限制 suggestion、alternatives、warnings 的 UTF-8 大小和数量，清理控制字符、去重并以 `metadata_result_truncated` 标记截断；Provider 异常使用稳定 failureCategory 和受控 remediation，不回显原始错误。结构化 Provider 结果会保留 suggestion、最多五条去重 alternatives、warnings 和 estimatedUsage；旧字符串 Provider 继续兼容。每次 generate 都绑定连接级 `requestId`，可选 timeout 以 `metadata_timeout` 结束；同一连接可用 `metadata.generate.cancel` 在 Provider 未完成前取消。断开、host/session/agent scope 变化和迟到 Provider 结果都会清理/拒绝 pending 状态，保证取消响应不会写到错误连接。App 只有在 Bridge `metadataGeneration` flag 和当前 Provider descriptor 的 `capabilities.metadataGeneration` 同时为 true 时显示入口，缺字段或不支持时安全降级。

### Usage、预算、诊断与兼容

R89 将全局 `serverInfo.features.providerUsage` 与 Provider Catalog 的用量 capability 聚合统一到 `ProviderUsageService.isAvailable(providerId)`：同时识别 Provider 原生 `getUsage()` adapter 和受控 HTTPS `usageEndpoint`，因此 endpoint-only Provider 不会因缺少 adapter 方法而被错误隐藏；未配置、不安全或带 URL 凭证的 endpoint 仍保持不可用。

Usage event 以 event id 去重，并按 host、session、agent、Provider 和时间窗口聚合。实际值与 estimated 值分组保存；未提供的 token、cost 或 quota 数值保持 unavailable，而不是补零。Token 分类覆盖 input、output、cache read/write、reasoning 和 total；费用按 currency 分组，禁止跨币种直接合计。Quota 保留 remaining、limit、resetAt、source 和 Provider；compaction event 保留 before/after token、原因、estimated 和 ISO 时间。Codex App Server 的 `thread/compacted` 与 `contextCompaction` completed item 通过 thread/turn keyed pending state 顺序无关地配对，优先合并 item 详情，并在 turn 完成边界处理只有通知的情况；OpenCode 的 `step-finish` 与结构化 `compaction` part 按 part id 去重；OpenClaw Responses 与 Hermes Studio completion 按响应 id 去重，避免同一次压缩或重放事件重复计费或展示。Gateway 没有稳定 compaction 契约时保持字段缺失，不从普通文本推断。R28 live smoke 还验证了 Provider usage 缺少 `agentId` 时由当前 session 的权威 Agent 补齐，以及断线重连后 usage/budget 的 host 隔离恢复。

Provider 套餐用量是独立的按需数据源：`provider.usage.list` 只返回 provider-agnostic 的 plan/window/balance DTO，不把凭证带入 RPC、日志或持久化。Bridge 优先调用 Provider adapter 的 `getUsage()`；没有 adapter 时可为每个 Provider 配置 `usageEndpoint`，或通过受控的 `usageEndpointEnv` 指向环境变量，Codex 的 `AGENT_BRIDGE_CODEX_USAGE_URL` 继续兼容。quota 的 remaining/limit/used 只接受非负、有限且不超过 JavaScript 安全整数上限的数值；负数、Infinity、NaN 和超限值保持字段缺失，quota event 不会把非法数据写成 0。endpoint 和所有重定向目标只接受 HTTPS，拒绝 URL 内嵌凭证，最多跟随 3 次重定向，响应体限制为 256 KiB，并使用有限超时；带认证请求只允许同 origin 重定向，避免把 Bearer 头发送到另一主机；认证值只能从显式 `usageEndpointTokenEnv` 环境变量读取。HTTP、重定向、响应大小、JSON 和超时错误均返回结构化 `failureCategory`，Provider 未提供套餐数据或明确返回 unavailable/error/failed 时稳定降级为 `ok=false`，App 通过 `providerUsage` capability 隐藏或显示对应区域。Bridge connection 补齐的 host/session/agent/window scope 是权威来源；Provider 没有回显时补齐，显式返回冲突值时覆盖并返回 `provider_scope_response_ignored` warning，防止跨会话数据混入。若 Provider 显式返回 `stale`，或有效 `expiresAt` 不晚于当前时间，Bridge 以可选 `stale: true` 标记最后一次快照但保留 `ok/status` 供只读展示；stale 快照不会生成新的 quota Usage event。缺少该字段的旧 Provider 结果仍按 legacy fresh 行为兼容。
Provider usage 结果另外带可选 `availabilityState`：`unsupported` 表示 Provider 没有可用 adapter/endpoint，`available-empty` 表示能力存在但本次没有套餐数据，`available` 表示有真实窗口或详情，`failed` 表示请求/Provider/endpoint 失败，`stale` 表示最后一次快照已过期，`loading` 仅作为客户端过渡状态。旧客户端继续读取 `status`/`ok`/`stale`；新 App 优先消费状态字段并使用本地化文案，避免把“支持但暂无数据”误报为普通 available。新状态不改变 quota event 的真实值、host scope 或 stale 去重规则。R104 进一步为 `ProviderUsageService` 增加按 `providerId + hostProfileId + sessionId + agentId + window` 隔离的有上限内存快照缓存：同 scope 刷新失败时保留最后一次成功快照并标记 `stale`，使用稳定 warning 表示刷新失败，TTL 到期或 scope 不匹配时仍返回结构化失败；stale 回退不会生成新的 quota event。

R114 将 Provider usage 结果的可选 `details` 从 `AgentBridgeIncomingParser` 的强类型记录接入 Agent Home Provider Usage 区。页面只渲染受限的 `key`、`label`、`value` 和 `status`，空 label 回退 key，双空回退 unavailable，不展示原始 JSON；中英文文案通过资源表维护。该闭环只证明 App 能消费附加详情，不把缺失详情误判为 quota，也不替代真实 Provider 账单、长会话和现场数据。

Budget key 强制包含 `hostProfileId` 及 session/agent scope，并支持 session、day、month window。Budget 可设置 token limit、cost limit、currency 和 warning threshold；Bridge 只在阈值跨越时发布去重的 `usage.budget.warning`。预算是非阻断告警，不改变 message queue，也不停止 agent。

Usage 事件通过 `usage-event-router.js` 做连接级 host 路由：有 `hostProfileId` 的客户端只接收同 host 的 `usage.updated` 和 `usage.budget.warning`，不会因为另一个 host 的 session 产生用量而看到事件。触发事件的来源连接始终保留回送资格；旧客户端没有 host 标识时只回送来源连接，兼容旧协议同时避免把本地用量广播给其他 legacy 连接。来源连接只存在于本次发送路径，不写入 usage state。

`DiagnosticsReport` 使用版本化 schema 和固定分组：daemon、provider、terminal、queue、usage、secureStorage、remoteConfig、persistence。JSON 与 text export 都由 Bridge 实际生成，受报告大小限制并返回 `truncated`。报告按 allowlist 组装并统一脱敏，不包含 token、credential、消息/终端正文、文件内容、私钥路径或完整远程配置 URL。`redactDiagnosticText()` 对 HTTP/HTTPS、WS/WSS 和 `file://` URL 使用协议感知规则：网络 URL 仅保留无凭证 origin marker，文件 URL 使用稳定 marker；Bearer/Basic、access/refresh token、API key、client secret、authorization、cookie 和私钥路径均在公开报告前清除。Remediation 只返回受控 `actionId`；App 只把已知 id 映射到现有安全操作或设置入口，不执行服务端字符串命令。

`serverInfo.compatibility` 是 Bridge 给出的权威兼容结果，状态为 `compatible`、`upgradeRecommended`、`appTooOld`、`bridgeTooOld` 或 `unknown`，并携带 blocking、reason、App/Bridge 最低与推荐版本、协议最低/推荐版本、支持协议列表和 remediation。协议版本优先按支持列表精确匹配；旧 Bridge 只有 `minimumProtocolVersion` 时，Bridge 按同一协议族的数字后缀比较 `agent-bridge.vN`，低于最低版本阻断，缺少客户端协议或协议族无法比较则降级为 `unknown`，不会把缺失元数据误报为兼容。App 连接模型、hello、Push 注册和会话子窗口的 `appVersion` 默认为空，只由 `bundleManager.getBundleInfoForSelf().versionName` 提供运行时版本；读取失败保持 unavailable，使 Bridge 按缺失客户端元数据返回 `unknown`，而不是伪造 `1.0.0`。Bridge 的 `minimumAppVersion` 默认值仍是兼容基线，不代表当前 App 版本。旧 Bridge 缺少这些可选字段时使用 `unknown` 或空列表，不阻断既有能力。显示设置作为 host-independent preference 保存，聊天字号限制为 12–22、代码字号 11–20、行高 18–32，代码字号同时作用于聊天代码块和 Git/Diff，compact density 控制消息、详情和工具卡间距。

### R29 Usage 事件规范化

共享 `UsageManager` 是 Provider usage、budget 和 diagnostics 聚合的最终持久化入口。它对 token、quota、compaction 只接受非负安全整数，对 cost 只接受非负有限数；聚合历史事件时重复执行同一校验，避免损坏 state 污染摘要。只有 inputTokens 与 outputTokens 同时存在时才推导 totalTokens，单侧字段保持 unavailable。R29 定向 smoke 与 Bridge 全量 `check` 已验证该边界；真实 Provider 套餐、长会话 compaction 和真机展示仍由 FIELD 验收。

R76 将同一 unavailable 语义前移到 Provider producer：Codex App Server、OpenCode 和 Gateway normalizer 都拒绝负数、非安全整数 token 与负数/非有限 cost，不再把缺少 currency 的费用标成 `USD`；只有明确的 Provider `totalTokens` 或同时具备 input/output 时才输出 total。OpenCode、Gateway 和 Codex 的成功 fixture 均显式声明币种，跨 Provider producer integrity smoke 覆盖单侧 token、reasoning/cache-only、缺币种、多币种规范化、分数 token 和全非法事件丢弃，并通过 `check:r76` 纳入全量 `postcheck`。这保证了事件级 producer、UsageManager 与 App summary 对 unavailable 的解释一致。

### 自适应工作台、刷新与会话窗口

`AgentHomeWorkbenchCoordinator` 使用页面根节点的实际窗口宽度计算布局，设备宽度只作为首次 fallback：

- compact：小于 720 vp，单栏。
- medium：720–1199 vp，约 280 vp scope pane 与主会话双栏。
- expanded：不小于 1200 vp，约 300 vp scope pane、至少 480 vp conversation pane，以及 320–420 vp detail/terminal pane。

`adaptiveWorkbench=false` 时保留原有 HdsNavigation/Pager。三档布局共享 host/workspace/session/detail 状态，尺寸变化只重排 UI。`AgentHomeCommandRegistry` 为菜单、命令面板和快捷键提供同一 command model，包括 capability gate、enabled/disabled reason、symbol、shortcut 和 confirmation metadata；危险命令只打开现有 preview/confirm 流程。

`AgentHomeVisibleScopeCoordinator` 根据布局、主页面、活动 sheet、workspace tab 和右栏 tab 解析唯一刷新 scope。chat 只刷新 history/queue/usage，files 刷新当前目录，changes 刷新 Git status/diff，terminal 刷新 terminal list/active terminal，doctor 刷新 daemon/diagnostics，workspace 和 details 只刷新当前对象。同 scope 在途请求合并；完成时同时校验 hostProfileId 与 host epoch。该路径不触发 Provider 扫描、远程 catalog 或其他 host。

会话多窗口使用专用 `NGFAgentSessionWindowPage` 和轻量 `AgentHomeSessionWindowController`，不会再加载一份完整 `NGFAgentHomePage`。Window LocalStorage 只携带 `hostProfileId`、`workspaceId`、`agentId`、`sessionId`、`instanceId`；凭证通过 host profile alias 从安全存储解析，不跨窗口传递。Controller 只请求和订阅目标会话的 messages、queue、usage 与 terminal。

`AgentHomeSessionWindowCoordinator` 对同一会话复用并聚焦现有窗口，允许不同会话并存，并在 host/session/workspace 失效、数据清理或页面退出时关闭受影响窗口。直接关窗事件会清除内部 map；延迟创建完成前会重新校验 scope，避免加载已经失效的会话。关窗只释放 client、watch、timer 和 UI subscription，不停止 agent。窗口注册仅保存在内存中，因此 App 重启后不自动恢复独立会话窗口。

静态 Web UI 复用同一 Bridge HTTP/WS 协议，不创建平行后端。首次 bearer 验证后，`/web/auth/session` 签发绑定 Host/Origin 的 HttpOnly、SameSite=Strict session cookie；页面刷新只用 cookie 换取一次性 WebSocket ticket，logout 清除 cookie，token 不写入 URL、localStorage 或 sessionStorage。Web 工作台通过 `workspace.registry.list/create/import/open/archive`、`agent.list`、`session.messages` 建立真实 workspace/session 状态；Import、Open、Archive 均先 preview 再 confirm，Archive 只修改 registry 元数据且旧 Bridge 缺 import RPC 时回退 create。terminal 入口按 `terminalBinaryFrames`/`terminalActivity` gate；V2 terminal stream 在同一 WS 上处理 subscribe/restore/output/input/resize，并检查 `bufferedAmount`。`workspaceFiles` capability 下提供 workspace 文件列表、受限预览和一次性同源下载 URL；Git/Diff 使用结构化 changes/diff 分页，Web 的 stage/unstage/commit/pull/push/branch/stash/merge/discard 操作复用 Bridge plan gate，并提供 summary/files/unified 视图和当前文件分页缓存，其中高风险动作必须 preview/confirm。Diagnostics 工作台读取 `daemon.status`、`daemon.health`、`workspace.registry.doctor` 和脱敏 `diagnostics.export`，规范化 daemon/provider/terminal/queue/usage/secureStorage/remoteConfig/persistence 八组状态，兼容缺字段时降级，并只把受控 actionId 映射到页面安全入口；标签之间通过不携带凭证的 `BroadcastChannel` 同步 workspace/session 变更、刷新和注销。R65 进一步在广播中携带 endpoint/hostProfileId，拒绝跨连接 scope 事件，并将 workspace.changed 限定为 registry + 受影响 session 的局部刷新；notification read/action 与 diagnostics export 只消费脱敏 DTO。GitHub 工作台继续复用同一 RPC：OAuth Device Flow 只显示用户码与 HTTPS 验证地址，账号与 workspace/repository binding 显式确认，PR list/status/checks/watch 提供分页和生命周期，reviewer/label/update/merge 与 attachment upload 统一使用短期 `planId` preview/confirm；未发布 `githubAssetUpload` capability 时隐藏上传入口。Browser Web 工作台进一步消费同一 browser broker，提供 host 选择、instance/page 生命周期、导航、snapshot/screenshot/logs/wait/download、permission 和全部 action；host 未声明能力时不显示按钮，上传路径只接受 workspace-relative 值。完整 Web 源码 smoke 已通过，真实多标签、旧 Bridge、长流、受支持平台 host、HarmonyOS App 全量动作和浏览器现场仍是 23B/23D 剩余门。

R115 将 Web Session Experience 的 Provider usage 直读接到同一 host/workspace/agent/session/provider scope：`provider.usage.list` 结果只经过受限 normalizer 后显示套餐、quota windows、details、freshness、warnings 和 remediation，不进入 UsageManager 历史聚合，也不回显原始 JSON。`providerUsage` feature 与 Provider descriptor capability 双门控，旧 Bridge 或无能力 Provider 隐藏入口；手动刷新复用连接代际和 in-flight guard。

R146 为 Web Session Experience 增加显式 usage window scope。Usage 面板可选择 `session`、`day`、`month`，summary、events、budget 和 Provider usage 请求共用当前窗口，queue 请求保持独立；窗口进入 scope key，切换时清理旧结果并重新请求。新 Bridge 回显的窗口与请求不一致时显示受控降级提示，旧 Bridge 缺 optional `window` 时保持 session 默认兼容，不把返回的 session 数据标记为日/月。该子阶段通过 `check:r146`、R28 live day/month 查询和 Bridge 全量 check；真实 Provider 账单、旧 Bridge 多标签、HarmonyOS App 和现场数据仍由对齐清单的 FIELD 门负责。

R149 为 Web Session Experience 增加跨标签增量同步。`BroadcastChannel` 的 `experience.changed` 事件只携带 host/workspace/agent/session 标识和受限操作元数据；接收端要求完整 scope 精确匹配，之后只刷新 queue、usage、budget 和 Provider usage。queue cancel/retry、budget save/clear 与 Provider usage refresh 在成功后发送事件，避免兄弟标签显示陈旧状态，也避免把本地体验变更扩大为 workspace、Provider catalog 或其他 host 的全量刷新。旧标签或旧 Bridge 不认识该事件时保持既有单标签与 Bridge event 路径。

R124 补齐 Web 页面从浏览器 bfcache 返回时的生命周期恢复：`pagehide` 释放 WebSocket、终端流、GitHub watch、刷新定时器、pending RPC 和 BroadcastChannel 后，只有 `pageshow.persisted` 才重新启用 transport、递增 connection generation、获取短期 ticket 并恢复当前标签 scope。缺少 endpoint/内存会话或已注销时不自动重连；该恢复路径不把 bearer token 或 ticket 写入 URL 或持久化存储。真实多标签、旧 Bridge、长流和现场 Browser host 仍由对齐清单的 FIELD 门负责。

R125 将 Web Browser 工作台的 hosts/instances/pages 列表刷新绑定到单调 refresh token、connection generation、workspaceId、当前 host 和 socket/page lifecycle。每段串行 RPC 返回后重新校验该 gate；workspace/host 切换、断线重连或 Browser capability 关闭产生的迟到结果会被丢弃，残留列表与截图同时清理，避免旧 Browser 实例穿透到当前 scope。真实平台 host 与恶意页面现场仍由第 16、23D 的 FIELD 门负责。

 R116 将 Web Browser screenshot 接到同一 broker 的受限公开 DTO：Bridge 和 Web compatibility 只接受 PNG/JPEG/WebP，线性校验 Base64 并限制 8 MiB 编码、6 MiB 解码载荷；Web 只把校验后的 data URL 交给独立 Image 预览。R117 进一步要求 PNG `89 50 4e 47 0d 0a 1a 0a`、JPEG `ff d8 ff`、WebP `RIFF`/`WEBP` 文件签名与 MIME 一致，只解码前 12 字节，不信任 host 上报的 bytes；伪图片、头部缺失和 MIME/签名错配统一返回 `browser_screenshot_invalid`。host/page 切换、Browser capability 关闭、断线、logout 和页面生命周期都会清除 data URL。定向验证使用 `check:r117`/`check:r116`，真实平台 host、恶意页面和登录态仍由 FIELD 负责。

R119 在同一 broker 增加 `validateBrowserActionPayload()`，把 action 参数边界集中在 Bridge，而不是依赖各个 host 自行解释。元素引用限制为 256 UTF-8 bytes，键名限制为 128 bytes，文本和值及 evaluate 脚本限制为 128 KiB；空 ref、控制字符、空脚本、冲突脚本字段、无界 drag 坐标和 scroll delta 均 fail closed。旧 drag `toX`/`toY` 映射到受限 `targetX`/`targetY`，upload 继续保留 legacy optional-ref 兼容。无效 payload 在 capability/plan dispatch 前返回稳定错误，不创建 preview plan 或向 host 派发。`check:r119` 已纳入 `postcheck`；该边界不代表真实平台 host 或 HarmonyOS App 动作已完成。

R120 将 action payload 从原始对象复制改为按 action kind 的最小投影。scope 标识和 page ref/key 先执行长度与控制字符校验，click/fill/type/keypress/hover/select/drag/upload/scroll/download/evaluate 只保留各自声明的字段；confirm/planId、URL、路径、headers、环境、非 evaluate 脚本和未知字段不会进入 host envelope。内部下载目录与经过 realpath/hash 的上传 filePaths 仍由 manager 在投影之后注入。drag steps 归一化为 2–20 的整数，投影后的 payload 才参与 plan digest，防止未知字段影响确认或被 host 解释。`check:r120` 已纳入 `postcheck`，但真实平台 host、HarmonyOS App 全量动作和浏览器现场仍由 FIELD 验收。

HarmonyOS App Browser 请求由 `AgentHomeBrowserRequestCoordinator` 保存完整目标快照；响应必须关联 envelope 或 payload request id，并对 workspace/host/instance/page scope 做一致性校验。scope 冲突的结果会被一次性消费并丢弃，防止合法 request id 携带错误实例的迟到结果覆盖当前页面；缺少 optional scope 字段的旧 Bridge 仍兼容，多个无 id 响应不会猜测归属。该层只保护 App 状态，不把声明式 host metadata 当作平台适配证明。

### Web 旧 Bridge 兼容层

`tools/agent-bridge/src/web/compatibility.js` 是 Web 控制面的唯一兼容归一化入口。它在 health/serverInfo 到达后一次性解析 feature advertisement、权威 compatibility DTO 和旧 Bridge 缺字段状态；`app.js` 的增强区域只通过 `featureEnabled()` 判断能力，不从单个 RPC 响应猜测能力。缺少 `features` 时隐藏 terminal binary、workspace files、Git advanced、Browser、GitHub 和 diagnostics 等增强入口，但仍保留 Agent list/attach/send、attach timeline 和基于 Agent scope 的只读 workspace fallback。

Session messages 支持现代 `messages`、旧 `timeline`、旧数组和缺字段降级；workspace registry 的 optional failure 不会破坏核心聊天，import 在旧 Bridge 上继续使用 create fallback。事件先经过已知事件表和 host/workspace/agent/session scope 校验，未知事件或跨 scope 迟到事件不会更新当前 UI；旧事件缺少 scope 字段时保持兼容。该层只负责源码兼容，真实旧 Bridge、双标签、长流和真实浏览器仍由 R6-WEB-3/FIELD 现场轨道验收。

### Web 生命周期约束

Web 生命周期收口使用连接代际而不是 socket 引用猜测归属：每次连接创建、显式关闭或重新登录都会推进 `connectionGeneration`，open/close、重连 timer 和全量刷新只接受当前代际。`refreshInFlight` 合并定时器、手动刷新和跨标签刷新，health、agent、workspace、session、diagnostics 与 GitHub 阶段在每次异步边界复核连接状态；页面 `pagehide`、显式 logout 和跨标签 logout 统一调用 `shutdownTransport()`，释放 timer、watch、terminal subscription、pending RPC 与 BroadcastChannel。登出后重新提交认证表单会重新启用 transport、恢复刷新 timer 并建立新的 tab channel；旧 Bridge 或页面销毁产生的迟到结果只作为取消处理，不写入当前 UI。

## Voice 音频与语音架构

远程 PCM/raw 结果的 `sampleBits` 由 App 传入 NGF media contract，缺省按 16 位处理；媒体层只接受 8/16/24/32 位并映射到 SDK 23 的 U8/S16LE/S24LE/S32LE，避免将非 16 位音频固定按 S16LE 解释。压缩音频仍按 MIME 交给 AVPlayer，不使用 `sampleBits` 推断压缩格式。

Voice 复用现有 Agent Bridge V2 会话、capability gate、事件序列和 host epoch，不建立平行聊天后端。App 页面只调用 NGF media voice facade；HarmonyOS 平台对象集中在 `ngf_framework` 的 media/platformOhos 层：AudioCapturer 负责采集，AudioRenderer 负责播放，AudioSessionManager 与流级 `audioInterrupt` 负责音频焦点、中断和设备变化。页面不得直接持有或散落这些平台调用。

```text
Agent Home composer / voice mode
  -> NGF media voice facade
    -> AudioKit capture / playback / audio session
    -> optional CoreSpeechKit STT / TTS adapter
  -> AgentBridgeClient -> Bridge VoiceManager -> voice Provider adapter
```

SDK 23 的 OpenHarmony AudioKit 提供真实录音、播放和音频会话；HMS `@kit.CoreSpeechKit` 提供可选的 SpeechRecognizer 与 TextToSpeech。两者按独立 capability 发布，运行时仍检查 syscap、麦克风权限、engine 初始化和 Provider 状态。当前 App 会在本地 STT 可用时直接使用设备链路，不创建 Bridge Voice session；只有本地 STT 不可用且远程 capability 可用时才上传音频。即使能力探测阶段已经初始化 CoreSpeechKit，`remote_stt` 模式也不会向本地 recognition engine 写入 chunk 或调用 finish/cancel，release 仍会回收已初始化引擎。每次 AudioCapturer 都绑定 generation 与 capturer identity，迟到的 `readData` 回调在分帧前丢弃；后台不会创建新的录音会话，麦克风权限状态和受控设置 remediation 通过 capability snapshot 暴露。释放时用同一 callback 注销，并在 facade release 时注销 AudioSession deactivation listener，主动 deactivation 与系统中断通过期望事件计数区分；系统中断只对活动音频执行一次 cleanup，并公开 `audioSessionState=interrupted`，避免重复 cleanup 产生虚假状态。TTS 会话在本地与远程之间固定选择单一路径，远程 `audioBase64` 由 NGF media facade 解码并播放，不会双重播报。平台录音可用不等于 STT 可用，TTS 不可用时保留文本回答，不静默切换 Provider。Bridge Voice 默认不持有本机音频设备，因此 `voice.status.capabilities.audioCapture/audioPlayback`、`voiceActivityEvents` 和 `interruptionHandling` 默认均为 false；非法或非 HTTPS 的端点只产生脱敏 warning code，不回显 URL/token。

SDK 23 没有独立公开的通用 VAD API。SpeechRecognizer 的音频开始/结束事件只能映射为识别会话提示，不能冒充本地 VAD。手动开始/停止录音始终是安全降级路径。`@kit.AVSessionKit` 只用于后续系统媒体控制面，不替代 AudioSessionManager 的焦点管理，也不是 Voice 首版前置依赖。

Voice session、chunk、partial/final transcript 和 TTS event 绑定 hostProfileId、sessionId、voiceSessionId 和单调序列；本地与远程 transcript 只接受当前会话选定的权威来源。取消、超时、host 切换、页面退出、断线和 daemon 恢复统一进入幂等 cleanup：停止采集/播放与 AI engine、注销 listener、释放资源、清空内存 chunk，并只删除 manager state 登记的临时文件。普通日志、doctor 和通知不得包含音频、transcript 正文或 TTS 文本。远程 `AVPlayer` 的 `stateChange` callback 同时绑定 playback generation 与 player identity，迟到的旧播放器完成/错误事件直接丢弃；释放时使用同一 callback 注销，并通过 generation 递增使 stop/release 后的回调失效。Bridge `VoiceManager` 的 TTS request 还绑定 request identity/cancelled 状态，在 Provider response 解析和 `tts.ready` 发布前再次校验；stop、owner detach、shutdown 后的迟到响应统一为 `voice_cancelled`，不得进入播放链。Bridge Voice lifecycle event 仅携带内部 owner metadata 到 server 路由层，由 `voice-event-router.js` 按 connectionId 精确单播，发送前剥离 owner 字段；缺少 owner 的事件不广播，避免 transcript、VAD、TTS 状态或音频结果跨 WebSocket 连接泄露。源码 smoke、Bridge 全量 check 和 SDK 23 HAP 已通过；真实设备音频路由、来电打断、蓝牙和 Provider 服务可用性仍是现场验收门。完整 SDK 声明、权限、降级、隐私和验收边界见 `docs/agent-bridge-voice.md`。
Voice Bridge 在 RPC 边界继续执行音频 MIME allowlist、整数采样率/声道/采样深度、语言与文本长度校验；Provider 返回的 transcript、audio profile、confidence 和 duration 只在有效范围内进入公开结果，未知 TTS 格式或无效 profile 结构化失败。Provider 原始异常映射为稳定脱敏文案，避免 endpoint、token 或实现细节进入 App、日志和事件。

Agent Home 的 `AgentHomeVoiceRequestCoordinator` 进一步把远程 STT start/finish/cancel 与连接 epoch、request id 和 Bridge session id 绑定；取消、host 切换或页面退出后，迟到响应与旧 session 事件在进入 UI 状态前被丢弃。该层只保护 App 状态，不替代真实 Provider、音频路由或真机现场验证。

Voice capability matrix 只描述远程 STT/TTS 字段的权威性，不代表 Bridge 拥有本机麦克风或扬声器。新 Bridge 在 `serverInfo.features` 发布可选 `voiceCapabilityMatrix=true` 后，App 必须分别消费 `voiceRemoteSpeechToText` 与 `voiceRemoteTextToSpeech`；缺少该标识的旧 Bridge 才允许使用 legacy `features.voice` 汇总值，避免只配置 STT 时误显示远程 TTS。该字段缺失、未知或为 false 时按旧协议安全降级。

R118 在 Agent Home 增加 `AgentHomeVoicePlaybackCoordinator`：每次 device/remote TTS 开始、用户中断、页面消失、host quiesce 和 runtime reset 都推进 playback generation；初始化、`speak()`、`playAudioBase64()` 的异步回调同时校验 generation、hostProfileId 和 connectionEpoch。旧 host 或已离开页面的初始化不会启动播放，迟到的完成/异常不会清除新一轮 TTS 状态；该门只保护 App 状态，不替代 Bridge request identity、media cleanup 或真机音频路由验证。

R121 在该 coordinator 上补充请求等待与正常播放的显式状态转移：`playbackStarted` 只在当前 generation/scope 把远程结果交给 NGF media 时置位，媒体 snapshot 在 `ttsRequestId` 清空并进入 idle/error/interrupted 后执行 `complete()`；页面的停止按钮和状态文案共用 active speech predicate，因此 Provider 等待期间可取消，完成或 host quiesce 后不会残留远程 TTS mode。该状态门仍不替代 Bridge request identity、媒体资源清理和真机音频现场验收。

R153 处理 Bridge 兼容双交付：同一远程 TTS 音频可以同时由 `voice.tts.updated` 事件和 `voice.tts.speak` response 到达 App，页面按 `clientRequestId -> ttsRequestId -> envelope request id` 解析 delivery identity，并在写入 Voice 状态或调用媒体 facade 前由 playback coordinator 单次消费。同一 generation/host/epoch 的第二次交付被丢弃，而新 generation 可正常播放；两条协议路径均继续保留。

R130 将同一生命周期门扩展到远程 STT finish：`VoiceManager` 为每个转录请求维护内部 request record，并在 Provider 响应解析和 `transcript.final` 发布前校验 request registry、session identity、owner 生命周期与取消状态。用户取消、owner detach、session 过期和 daemon shutdown 会先 abort 并标记 request，迟到响应统一归一化为 `voice_cancelled`，不会产生 `session.failed` 或写入旧 transcript；正常 Provider 错误仍保留稳定 failure category。请求完成、失败或取消时合并音频 buffer 和 request/session 状态均在 `finally` 清理。该门只收口 Bridge 生命周期安全，不替代真实 STT Provider、弱网、权限或真机音频现场验证。

远程 Voice 的保留状态采用独立、脱敏的 `voice.status.privacy` DTO。`VoiceManager` 只接受 `not_retained`、`ephemeral`、`retained` 三类受控声明；未声明、非法或未知值一律为 `unknown`，且在已配置对应远程端点时通过稳定 warning 和 `userNoticeRequired=true` 要求 App 呈现风险提示。每条 STT/TTS 链路只公开是否转发数据、策略、受限来源及可选时长，不公开 endpoint、token、原始环境变量、音频或 transcript。`serverInfo.features.voicePrivacyStatus=true` 使新 App 读取该可选 DTO；旧 Bridge 缺字段时安全降级。该值是部署方或 Provider 的声明，不构成对远程服务实际保留行为的审计，真实合同、保留期、地域、删除和变更通知仍是 Voice FIELD 验收项。

远程 PCM/raw TTS 播放在 renderer `drain()` 完成后清零写入用的复制缓冲和局部解码缓冲，并在写入或 drain 抛错时通过 `finally` 执行同样的清理；压缩音频仍由受管 `remoteAudioBytes` 生命周期清零。该内存清理由 Voice contract smoke 按播放分支和顺序断言，避免将任意路径上的 `fill(0)` 误认为 PCM/raw 已完成清理。

## Docker 运行架构

Docker 镜像以 `tools/agent-bridge` 为唯一构建上下文，包含 Bridge daemon、管理 CLI 和复用同一协议的静态 Web UI，不包含 HarmonyOS 工程、用户凭证或 Provider CLI。正式容器以前台 `supervisor-entrypoint.js` 运行，由 tini 转发信号，最终进程固定为 uid/gid 10001。

容器的数据边界分为三层：`/data` 是完整且不可拆分的 Bridge Home 一致性卷；`/workspace` 是用户显式授权的源码挂载；`/opt/ngf/providers` 是可选的只读外部 Provider binary 挂载。Token 与 TLS/Provider secret 通过 `/run/secrets` 或环境注入，不进入镜像层、普通 profile 或示例 Compose。

容器根文件系统默认只读，只有 `/data`、workspace mount 和受限 `/tmp` 可写。健康检查只读取 `GET /health`。`AGENT_BRIDGE_CONTAINER=1` 会关闭 daemon 原地更新/回滚能力；镜像升级由外部容器编排器替换不可变 tag，必要时配合完整 `/data` 快照恢复。完整运维说明见 `docs/agent-bridge-docker.md`。

验证链由 `tools/agent-bridge/package.json` 的 `check:r75` 统一接线：它先复用远程配置 `check:r32`，再执行 Docker contract smoke。Docker runtime smoke 仍保留在同一阶段，但默认只输出受控 skip，只有显式设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 才构建、启动、健康检查、重启并清理容器，避免普通 Bridge 回归隐式触发重型 Docker 构建。`npm run check` 的通过只代表 contract 与 Node/Bridge smoke 通过，不替代跨架构镜像、容器重启和生产卷恢复现场验收。

## Relay Transport 与 E2E

Relay 是 Agent Bridge V2 的可选网络承载，不是平行业务后端：

```text
HarmonyOS App
  -> WSS Relay broker (opaque routing, limits, backpressure)
    -> Agent Bridge Relay manager
      -> existing V2 request/event/binary handlers
```

broker 仅理解 `relay.register`、`relay.attach`、`relay.frame`、`relay.ack` 和 `relay.detach` 外层 envelope。公开配对/握手材料和加密业务 envelope 都位于 opaque payload；broker 实现不记录 payload。恶意 Relay 可以检查 opaque payload，因此能观察公开身份公钥、指纹、临时 ECDH 公钥、握手 nonce、签名，以及加密 envelope 的随机 session id、方向、序列、key epoch、JSON/binary 类型、GCM nonce/AAD、密文大小与时序，但不能获得 pairing secret、长期私钥、会话密钥、业务标识或业务明文。

Bridge 长期身份使用 ECDSA P-256，并迁移到受限的 `<Bridge Home>/security/relay-identity.json`；App 身份使用 HarmonyOS AssetStore 保存 DER key material。首次配对以短期 pairing secret 的 HMAC 证明注册 App 身份，后续连接使用双方长期身份签名 canonical transcript。每次 transport 连接使用新的 P-256 ECDH keypair，HKDF salt 绑定 relayId 与双方 nonce，info 绑定 sessionId、双方身份指纹和 key epoch；64 字节输出拆为 App->Bridge 与 Bridge->App 两把独立 AES-256-GCM key。

AEAD AAD 绑定协议版本、sessionId、direction、严格连续 seq、keyEpoch 和 contentType；每帧使用端点 CSPRNG 生成独立的 96 位 GCM nonce。重复、跳号、方向错配、旧 session、transcript 修改或 GCM 失败都会在业务 parser 前关闭会话。重连不恢复旧 cipher 或 seq，pairing secret 只在首次配对内存中存在；成功后 App host profile 只保留公开 Relay endpoint，Bridge 只保留最小设备信任记录。

Relay manager 解密成功后创建与本地 WebSocket 相同的 connection contract，因此 Provider 事件、terminal/file binary frame、生命周期清理和 capability gate 共用既有实现。设备 revoke 与身份 rotate 使用一次性 plan preview/confirm，并立即关闭受影响会话。完整威胁模型和现场边界见 `docs/agent-bridge-relay-threat-model.md`。

文件传输的 binary frame 仍由 `FileTransferManager` 直接发送到准备该 request 的 connection；其 progress/completed/failed lifecycle event 也绑定同一 connectionId。`file-transfer-event-router.js` 只向 owner 单播，server 发送前剥离内部 owner，HTTP 兼容 RPC 没有 owner 时不向其他 WebSocket 广播 workspace、相对路径、文件名或摘要。连接断开会取消上传并标记下载，连接重建需要重新发起 request。

Terminal lifecycle event 也不再使用全局广播：`TerminalManager` 为创建连接和 active stream subscriber 生成内部 scope，`terminal-event-router.js` 只向这些连接投递 `terminal.updated`、`terminal.attention`、`terminal.capture.persisted` 和 `terminal.stream.exit`，server 发送前剥离 owner/subscriber metadata。无匹配 scope 的事件直接丢弃；terminal hook 状态是 daemon 级配置变更，仍可广播给所有连接。attention notification 只有在存在目标连接时才进入通知存储和 push 队列。

通知持久化和通知 RPC 同样受 host scope 约束：`notification-manager.js` 为记录保存可选 `hostProfileId`，server 按 `clientHello.hostProfileId` 将 Agent/terminal 通知分组创建，并让 list/read/action/prune 只看到当前连接 host 的记录。跨 host 的 read/action 统一降级为 `not_found`，scoped prune 不触碰其他 host；没有 host 标识的旧客户端保留无范围兼容行为。内部 automation connection 的通知先按已确认 workspace 找到真实目标连接，再按 host 持久化和投递，不会写入 `bridge-automation` 伪 host。

Push subscription 也使用同一 host scope：`push-notification-manager.js` 只在当前 host 内更新或注销 token，host-scoped notification 的 delivery 只读取同 host active subscriptions，异步 `notification.push.updated` 只发送给同 host 连接。无 host 的 legacy notification 仍按旧行为投递到无范围/全部 active subscriptions；公开 subscription DTO 只含 token fingerprint，不回显原始 token。

## GitHub 与大型 Diff 增强

GitHub 集成支持 OAuth Device Flow 和兼容的环境 token。OAuth token 仅进入操作系统安全存储，普通持久化只保存账号元数据及 host/workspace repository binding。Credential store 使用带超时和输出上限的受控进程执行器，检查 Keychain/Secret Service 命令退出状态；Windows DPAPI 文件采用原子写入，账号标识先通过安全 key 校验。Device Flow session 在过期、终态拒绝、token/账号校验失败或安全存储失败时清理；`authorization_pending`/`slow_down` 保留 session 并遵守 nextPollAt。WebSocket 连接声明的 `clientHello.hostProfileId` 是 GitHub 请求的权威 host scope；有 scope 时 server 覆盖请求 payload，旧无 scope 客户端保留兼容行为。PR 修改、reviewer、label、merge 和附件上传使用短期一次性 plan，并绑定 host、repository、PR 与 head SHA；跨 host 或重复消费会失效。真实 Bridge WebSocket host-scope smoke 还锁定了连接关闭后的 watch subscriber 清理，防止遗留轮询。

PR/checks watch 是连接期受控订阅，watch key 包含 host，subscriber 记录内部 connection owner，使用 ETag、rate-limit reset 和指数退避；最后一个 subscriber 退出或所属 WebSocket 断开后释放，不作为 daemon 永久后台任务。

`workspace.diff.get` 可选接受 `fileCursor`、`fileLimit`、`lineOffset`、`lineLimit` 和 `maxBytes`，响应返回下一游标、`truncated` 与 `truncationReason`。旧客户端不传新字段时继续获得安全默认上限内的首段 Diff。HarmonyOS App 使用强类型 parser 保存分页游标和截断状态，按行优先、文件其次继续请求；重复页按游标去重，并通过主机隔离的幂等存储恢复当前 Diff 状态。

R147 将同一分页完整性约束接入 Web：每个文件/行游标生成 page key，重复请求不再追加同一段文本；缓存保存已加载游标和截断原因，Details 区展示 `truncated/truncationReason` 并继续请求下一页。旧 Bridge 缺字段时保持首段兼容，真实大仓库、二进制/解析失败 Diff 和长流性能仍需现场验证。

## Daemon 配置与实例聚合

每个 Bridge 在本地保存独立的稳定 `instanceId`，supervisor worker generation 用于拒绝旧实例响应。Bridge 只管理自身配置、重启和更新，不保存其他实例凭证。

远程配置通过签名、无嵌入凭证的 HTTPS 文档执行 fetch、validate、preview、apply 和 rollback；入口和每次重定向都重新拒绝 HTTP、凭证、fragment、控制字符和无效 host。安全字段不能由远程配置提供；本地显式配置优先于远程默认值。App 使用已有 host profiles 分别直连 Bridge，按 hostProfileId、instanceId 和 generation 聚合健康状态，并以首错停止策略编排滚动操作。

远程配置文档按 schema v1 校验版本、scope、priority、有限 values 结构和签名编码；未知顶层字段只产生兼容 warning。Bridge 启动对 active、previous、fetched 状态做离线 reconcile：签名、摘要或来源 URL 异常会标记 degraded，损坏 fetched 会丢弃，绝不联网修复。validate/preview/apply 会重新计算 fetched digest，rollback 在切换前重新验证 previous；原子写失败返回 `state_persist_failed` 且不消费 plan。`daemon.config.status` 只公开版本、摘要、验证结果和降级原因，不返回远程文档或敏感值。Daemon config RPC 以当前 WebSocket `clientHello.hostProfileId` 作为权威 host scope；apply/rollback plan 另外绑定 host、instance、generation、source URL 和 configVersion，跨 host confirm 或来源/版本漂移都会在写入前阻断。R67 将这些字段以强类型 App 状态展示，status/validate/preview/apply/rollback 均显式传递 hostProfileId，确认对话框仅展示版本、scope、摘要前缀、覆盖字段和重启要求，来源 URL 在界面中隐藏。跨平台签名服务与双 Bridge rolling 仍属于 FIELD。

Daemon config 的管理 CLI 只走 live Bridge RPC：`daemon config status/fetch/validate/preview/apply/rollback` 在没有运行 Bridge 时统一返回 `live_bridge_required`，不旁路修改本地 store；Bridge 结构化失败保留 `failureCategory`、`message` 和 `remediation`，CLI 以非零退出码报告失败。MCP 同样复用公共 RequestType，status/validate/preview 标记为只读，fetch 标记 open-world，apply/rollback 标记 destructive，并在 stdio 层要求 `confirm=true` 后才触达 Bridge。

Daemon `status`/`health`/`logs` 的公开 DTO 不携带 Bridge home、配置、日志或 managed process ledger 的绝对路径。`configPath`/`logPath` 保留为兼容字段，但固定返回 `.agent-bridge/config.json` 与 `.agent-bridge/logs/daemon.log` marker；日志读取仍在 Bridge 内部使用真实路径。`managedProcesses` 只返回受控的 id、provider/kind、pid/存活状态、owner 摘要和创建/更新时间，移除 command、args、cwd 与完整 identity；路径读取失败返回稳定 warning，不把底层文件系统错误回显给远端客户端。该公开边界由 `check-daemon-public-surface-smoke.js` 覆盖，diagnostics export 继续使用独立八组 allowlist 脱敏报告。
Daemon update 状态复用同一公开边界：`daemon.status`/`daemon.health` 的 `update` 和独立 `daemon.update.status` 通过 allowlist 移除 saved state 中的 `command`、`args`、`cwd`、环境/凭证字段和绝对路径；`statePath`、`stagedPath`、`backupPath` 与 development root 只返回固定 marker。更新器内部仍使用真实路径完成原子写入、校验和回滚，App 继续读取版本、完整性、pending/replacement 等非敏感字段。

Fleet 连接由 `AgentHomeDaemonFleetConnectionPool` 按需创建，凭证仅从 host 安全存储短暂读取，连接结束或 host lifecycle epoch 变化时立即释放。`AgentHomeDaemonFleetCoordinator` 将目标划分为 completed、failed、pending 和 excluded：每一步只调用目标 Bridge 自身的 restart/update/rollback RPC，并等待 generation 增长和 `healthy` 状态后才算完成；旧 Bridge 缺少 instanceId、不可达或被 isolate 的实例不会进入 rolling target。executor 连接异常会被 coordinator 归一化为稳定的首错 failed 结果，host lifecycle/连接池停止产生的取消会保留 `failureCategory=cancelled` 并将结果状态设为 `cancelled`，页面销毁或 host 切换还会通过 `AgentHomeDaemonFleetRunControl` 在步骤边界返回 `status=interrupted`，后续目标继续保留 pending，不自动回滚已完成实例。rolling run 由 `AgentHomeDaemonFleetRunStore` 以版本化 settings 记录；App 重启读取遗留 `running` 时只转换为 `interrupted/app_restarted` 并恢复结果明细，必须重新 preview，不会自动重新执行旧操作。Fleet 查询结果通过 `summarizeDaemonFleetResults()` 生成强类型健康、Bridge/config 版本、告警实例和缺失心跳摘要，页面同时展示实例最近心跳；不可用/旧 Bridge 只读进入摘要，不会被加入 rolling target。Bridge 的 `daemonFleetOrchestration=false` 表示不存在中心 controller，`daemonFleetTarget=true` 只表示该实例支持被客户端编排；App 的 Fleet 能力由本地页面和 coordinator 决定。 R86 继续要求 rolling replacement 在 generation 增长且 health 为 healthy 后报告与计划一致的 Bridge/config 版本；restart 校验当前版本，update 校验目标版本，漂移分别返回 `daemon_version_mismatch` 或 `daemon_config_version_mismatch`，不会被误报为成功。

Fleet 写操作还必须经过 `tools/agent-bridge/src/daemon-target-guard.js`：请求中的 `hostProfileId`（若提供）必须与认证连接一致，`expectedInstanceId` 和 `expectedGeneration` 必须仍匹配当前 Bridge 快照。实例替换、代际变化或非法 generation 在 handler 执行前返回 `daemon_instance_changed`、`daemon_generation_stale`、`host_profile_mismatch` 或 `daemon_generation_invalid`，不得继续触发 restart/update/rollback。旧客户端未携带这些可选字段时保留原有单实例兼容路径；target guard 定向 smoke 与 Bridge 全量 check 负责锁定这条边界。

R110 新增双 Bridge live smoke：两个独立 supervisor 进程分别使用临时 home、端口和 token，通过真实 WebSocket host scope 读取 `daemon.instance.status`，验证 instanceId 隔离/重连稳定、supervisor replacement 后 generation 单调增长、A → B → A 切换不串线，以及跨 host、旧 generation 和跨实例 target 在 restart 前被拒绝。该 smoke 已接入 Bridge `postcheck`；它是源码运行时证据，不替代 Windows/Linux/macOS 安装、自启、真实跨平台 rolling 或 HarmonyOS App Fleet 现场验收。

Fleet 面板可见性由 App-local availability policy 决定（`AgentHomeDaemonFleetAvailabilityPolicy`）：只依据 App 本地 fleet orchestration 能力与已保存 host profiles（hostProfileId + endpoint 非空）显示，不读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；Fleet 面板是独立设置 stage，当前活动主机旧版或离线时其他已保存 host 仍可查询展示。collect 结果写入页面状态前按 hostProfileId 集合一致性（`matchesCurrentProfiles`）与 connectionEpoch 双重校验，host profiles 在查询期间变化时旧批次被丢弃。

Fleet target 资格还必须由目标自身的 `features.daemonFleetTarget=true` 明确发布。`AgentHomeDaemonFleetConnectionPool` 在生成 snapshot 时对 capability 缺失、JSON 无效或明确为 false 的目标 fail-closed：实例仍可进入只读健康/版本聚合，但 `rollingEligible` 保持 false；warning 只保留数量，避免把远端诊断文本带入 Fleet 汇总。该 per-target gate 与 `daemonFleetOrchestration=false` 分离，前者表示单实例是否允许被 App 编排，后者表示 Bridge 不承担中心 controller 职责。

Agent Home rolling preview 使用 `cloneDaemonFleetSnapshot()` 复制权威 snapshot，显式保留 Fleet target capability、rolling eligibility、warning count、heartbeat、版本和 isolate 状态。页面层不能通过旧构造参数重置 capability 默认值或丢弃告警元数据；Fleet plan 的 excluded/pending 分类必须基于 connection pool 已验证的快照。

普通 Agent Home 的 daemon status 还经过 `AgentHomeDaemonStatusCoordinator` 做客户端侧完整性校验：快照必须属于当前 `hostProfileId + connectionEpoch`，带 request id 时必须匹配当前在途请求；已建立的 `instanceId` 不接受缺失或变化的后续快照，`generation`/`workerGeneration` 只能保持或递增。host 切换、重新激活和清理会重置该状态。缺少新可选字段的旧 Bridge 仍可提供 legacy 快照，但不会在已建立实例身份后覆盖更完整状态。该 coordinator 只保护 UI 快照，不替代 Bridge 的 target guard，也不把单实例源码测试当作跨平台 Fleet 现场证据。

## 自动化与协作运行时

Schedules、Loops 与 Chat Rooms 共用 Agent Bridge V2 鉴权、Agent Manager、workspace scope、生命周期 coordinator、通知与事件传输，不创建平行 Provider 后端。

```text
ScheduleManager ── run trigger ──> Provider session / AgentManager
LoopManager ── worker + verifier ──> AgentManager ── isolated mode ──> managed worktree
ChatRoomManager ── explicit Agent mention ──> registered Agent session
```

`ScheduleManager` 持久保存 cron/timezone、并发、重试、retention、missed-run 和 run history。runner 使用同状态目录 lease 保证单实例触发，DST 重复本地分钟只运行一次；daemon 重启后的 running run 标记 interrupted。

`LoopManager` 将 worker 和 verifier 作为独立 Agent 执行，verifier 输出必须覆盖所有 acceptance criteria。每轮保存 worker output、结构化 verification、Agent id 与 usage；generation 阻止 pause/stop/takeover 后的迟到结果覆盖当前状态。isolated 模式复用 workspace service 创建受管 worktree。

Workspace Service Proxy 由 Bridge 内的 `ServiceProxyManager` 管理。服务定义按 workspace 持久化，启动使用无 shell 子进程、受限环境和 managed-process ledger；cwd 必须位于 workspace，代理上游固定为 loopback，且仅转发白名单请求/响应头。高风险 upsert/start/stop/remove/open 均采用 preview/confirm plan。daemon 关闭只停止进程而保留 `desiredState=running`，重启后 reconcile 可恢复服务；Agent/workspace 归档由生命周期协调器清理关联服务。HTTP/WebSocket 共用 service-scoped access session；单次 open ticket 绑定 service、owner、Host、PID 和 TTL，交换为 HttpOnly Cookie 后立即从 URL 移除。可选精确域名路由对未知同 namespace Host 返回 404，避免回落 Bridge 管理接口。
Workspace Service Proxy 由 Bridge 内的 `ServiceProxyManager` 管理。服务定义按 workspace 持久化，启动使用无 shell 子进程、受限环境和 managed-process ledger；cwd 必须位于 workspace，代理上游固定为 loopback，且仅转发白名单请求/响应头。高风险 upsert/start/stop/remove/open 均采用 preview/confirm plan。daemon 关闭只停止进程而保留 `desiredState=running`，重启后 reconcile 可恢复服务；Agent/workspace 归档由生命周期协调器清理关联服务。HTTP/WebSocket 共用 service-scoped access session；单次 open ticket 绑定 service、owner、Host、PID 和 TTL，交换为 HttpOnly Cookie 后立即从 URL 移除。可选精确域名路由对未知同 namespace Host 返回 404，避免回落 Bridge 管理接口。

Service lifecycle 事件也遵循连接归属边界：`ServiceProxyManager` 只在运行期记录 `serviceId -> connectionId`，upsert/start/stop/health/remove 的 WebSocket 请求把 owner 传入，进程 error/exit/health/stopped/removed 事件复用该 owner。`service-event-router.js` 只向匹配连接单播，server 发送前移除内部 owner；连接关闭和 remove 清理 owner map，HTTP 兼容 RPC 没有 owner 时只返回 RPC 响应，不向其他连接广播 workspace、cwd、端口或服务状态。

Browser Automation 采用 Bridge broker + 显式 host capability。`BrowserAutomationManager` 只把命令路由到已认证、已注册且声明支持对应命令的 host，并同时校验 workspace/Agent scope；新 host 还必须按 action 声明 click、fill、type、keypress、hover、select、drag、upload、scroll、download 和 evaluate 的真实支持范围。只声明旧 `supportedCommands` 的 host 保留兼容路由，但不会被误报为已声明 action capability。对于需要确认的 action，如果 ready host 未显式声明该 action，Bridge 在 preview 阶段直接返回 `browser_action_unavailable`，不创建 `planId`、不进入 confirm，也不向 host 派发命令；该 fail-closed 语义由 live smoke 固化。Host disconnect、command timeout、迟到 result 和 action 不可用均有稳定失败类别，daemon 不把临时 page/instance 误恢复为仍存活状态。host result 会在 broker 重新组装，过滤 `ok`、command/host identity、时间、失败字段和原型污染键，不能伪造响应归属或覆盖 Bridge 状态。域名 allowlist 作为版本化 Bridge state 持久化；HTTP(S) navigation、workspace upload realpath、固定 download 目录、结果大小和审计字段均在 broker 再验证。上传 preview/confirm 绑定文件大小、mtime 和 SHA-256，默认限制单文件 64 MiB、总计 128 MiB，文件变化或超限时拒绝执行。点击、输入、拖拽、上传、下载、evaluate、permission 与 close 通过 preview/confirm plan 防止跨页或跨 workspace 重放。

HarmonyOS App 的 action Preview 会保存完整的 workspace/Agent/host/instance/page、action 参数和文件列表快照；Confirm 只复制该快照并消费一次性 planId，不从确认时的可变输入重新拼装请求。页面离开、host 切换、断线和取消会清除快照；Bridge 仍对 plan digest、workspace ownership、文件 realpath/mtime/SHA-256 和 host action capability 做最终校验。这样即使用户在对话框期间切换页面或编辑输入，也只会得到明确的 stale/invalid 结果，不会把确认意图静默改写为另一目标。

当前随 Bridge 发布的 `BrowserCdpHost` 通过 Chromium DevTools Protocol 提供真实 adapter。CDP endpoint 默认仅允许 loopback；显式远程模式要求 HTTPS。`/json/list` 返回的 `webSocketDebuggerUrl` 不是可信输入，`validateDebuggerWebSocketUrl()` 会在建连前重新约束 ws/wss、embedded credential、fragment、HTTPS → WS 降级、host/port authority 和 loopback/远程网络范围。Accessibility snapshot 生成 page-scoped ref，导航或写操作后立即使 ref 失效；click、fill、type、select、upload、drag 和 download 执行前会重新读取 box 并检查 visible/enabled/stable，CDP drag 通过 source/target ref 或有界坐标派发分段真实鼠标事件，异常时释放按下状态。dialog 自动按受控策略处理，download progress 只记录元数据。Web UI 已将 host/instance/page 生命周期、导航、snapshot/screenshot/logs/wait/download、permission 和全部 action 映射到 capability-gated 控件；App、CLI 和 MCP 仍是 broker consumer，不直接持有浏览器调试凭证，也不根据运行平台猜测 Browser 能力。

HarmonyOS App 的 Browser 入口使用 `AgentBridgeBrowserResult.requestId` 关联 envelope `id` 或 payload `requestId`。页面维护带 action、workspace、host、instance 和 page scope 的 pending request 表，响应可以乱序到达；无 request ID 只在单个在途请求时兼容，多请求响应不会猜测归属。host 切换、Bridge 断开、页面销毁和 session window 释放会清空该表与截图预览。截图仅在 App 内生成受限 `data:image/...` 预览，允许 PNG/JPEG/WebP，Base64 上限为 8 MiB，失败或不支持 MIME 时清除预览；截图正文不进入日志、doctor 或持久化状态。R36 将 `hostKind/runtime/capabilitySource/readiness/supportedPlatforms/capabilityWarnings` 接入 App model/parser；新 Bridge 宣告 capability metadata 时，degraded/unavailable host 只展示诊断，不参与 dispatch，失败类别映射受控 i18n 文案，上传只接受 workspace-relative 路径。旧 Bridge 缺少 request ID、browser 字段或 metadata capability 时，App 保留 legacy connected/capability gate，不显示虚假的结果。

Browser lifecycle 事件使用与 Voice 相同的连接归属边界：`browser.host.registered`、`browser.host.unregistered` 和 `browser.permission.updated` 在 manager 内携带仅供 Bridge 路由使用的 `ownerId`，`browser-event-router.js` 只投递给匹配的 WebSocket `connectionId`。server 发送前删除 owner 字段；空 owner、未知 owner 和不匹配连接不会收到 `browser.updated`，因此 host workspace 范围和 domain allowlist 不会被全局广播。`browser.permission.set` 通过执行入口传递当前 connectionId，HTTP 兼容 RPC 没有 owner 时只返回同步响应。

`ChatRoomManager` 为每个房间维护 member role、单调 seq、message、thread、mention delivery 与 ack。连接 actor 来自 Bridge 连接身份，客户端 payload 不能伪造 actor。Agent 仅响应显式 mention，fan-out 上限为 5；Agent 响应清空 mention 并限制 routing depth，防止 Agent-to-Agent 无限回环。

Schedules、Loops 与 Chat Rooms 的 lifecycle event 不再通过全局广播投递。`automation-event-router.js` 在连接成功读取或写入对应实体后，保存运行期 schedule/loop/room id 与 workspace 订阅；事件必须带匹配实体或 workspace scope，才向已订阅连接单播。Chat Room manager 为 message/ack 等事件补充 workspaceId。WebSocket 断开会清除 scope registry，连接重建需要重新读取并订阅；未带可验证 scope 的事件直接丢弃。该边界只保护事件传输，不改变 manager 的持久化、权限和生命周期语义。

自动化实际创建的 Agent/session Provider runtime event 也不会绕过该边界：内部 `automationConnection` 发送的 session/agent/message/tool/permission 事件优先从 payload 读取 workspace，缺失时由 agentId/sessionId 解析当前 Agent，再由 `sendScopedAutomationRuntimeEvent()` 只投递给同 workspace 的已授权连接。无法解析 workspace 的 runtime event 默认丢弃，避免自动化会话正文或工具输入被无范围广播。可运行 `npm run check:automation-runtime-event-scope` 验证双 workspace 隔离和未知 scope 阻断。

三类写操作统一使用短期一次性 preview plan。App 只在对应 `schedules`、`loops`、`chatRooms` feature flag 为 true 时显示 Workspace 设置内的“自动化与协作”区；事件仅刷新当前可见能力的列表、history、rounds 或 room messages。

> 目标：在 NGF 框架基础上构建一款 HarmonyOS App，用于连接电脑上的 Claude Code、Codex、OpenCode 及其衍生版本，并提供会话管理、会话沟通、工具事件、权限确认和内容预览能力。

## 1. 架构边界

第一阶段采用三层结构：

```text
HarmonyOS App
  -> Agent Bridge Server
    -> Provider Adapter
      -> Codex / OpenCode / Claude Code / OpenClaw / Hermes / Custom Agent
```

### HarmonyOS App

职责：

- 管理远端主机配置、连接状态、会话列表和当前会话 UI。
- 通过统一协议发送用户消息、工具确认、取消请求和预览请求。
- 展示流式消息、工具调用、文件预览、diff、任务状态和错误。
- 使用 NGF 既有 `uiShell`、`data`、`systemTasks`、`webBridge`、`network` 能力。

不直接承担：

- 不直接适配 Codex / Claude Code / OpenCode / OpenClaw / Hermes 的 CLI 和本机服务差异。
- 不在首版实现完整 SSH 客户端、PTY 终端模拟或 shell TUI 控制。
- 不在移动端保存第三方 Agent 的访问令牌或云端凭据。

### Agent Bridge Server

职责：

- 运行在用户电脑上，作为移动端和本机 Agent CLI/SDK 之间的稳定协议层。
- 统一鉴权、会话状态、事件流、工具权限请求和预览资源访问。
- 提供可替换 Provider Adapter，使不同 Agent 只需要实现同一套内部接口。
- 后续可以通过 SSH 隧道、局域网、反向代理或配对码暴露给 App。

### Provider Adapter

职责：

- 封装单个 Agent 的实际通信方式。
- 将 Agent 的消息、工具调用、文件变更、权限请求转换为统一事件。
- 第一批适配优先级：OpenCode -> Codex -> Claude Code -> OpenClaw -> Hermes -> Custom.

## 2. 为什么先做桌面 Bridge

各 Agent 的远程能力不一致：

- OpenCode 提供 server 模式，适合作为首个端到端验证对象。
- Codex CLI 提供远程 app-server/WebSocket 形态，适合作为第二个适配对象。
- Claude Code 更适合在桌面端通过 Agent SDK 或本机包装层接入。

如果 App 第一版直接做 SSH + 交互式终端，会把协议差异、TTY 渲染、权限弹窗、文件预览和会话恢复都压到 ArkTS 侧，风险和调试成本过高。

## 3. 第一阶段 MVP

第一阶段只交付最小闭环：

1. 电脑先运行 `npm install -g @dlzz/agent-bridge` 安装桌面 Bridge，再通过 `ngf-agent-bridge --setup` 完成首次配置；后续用 `ngf-agent-bridge` 启动常驻服务，仓库开发场景可改用 `tools/agent-bridge`。
2. App 或调试客户端通过 token 连接 Bridge。
3. 获取 Bridge 健康状态和 Provider 能力。
4. 创建一个会话。
5. 发送一条用户消息。
6. 收到统一事件流。
7. 请求一个文本预览或 diff 预览。

首个 Provider 使用 `mock`，用于打通协议和 UI；OpenCode Provider 作为第一条真实 Agent 接入链路。

## 4. 统一协议

### HTTP

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | Bridge 存活检查 |
| `GET` | `/capabilities` | 返回协议版本和 Provider 能力 |
| `GET` | `/preview?sessionId=...&path=...` | 返回文本预览或 Provider diff |

### WebSocket

路径：`/ws`

所有消息使用 JSON 文本帧。

客户端请求：

```json
{
  "id": "req-1",
  "type": "session.create",
  "payload": {
    "providerId": "mock",
    "workspacePath": "F:/DevEcoStudioProject/Coder"
  }
}
```

服务端响应：

```json
{
  "id": "req-1",
  "type": "response",
  "ok": true,
  "payload": {
    "sessionId": "ses_..."
  }
}
```

服务端事件：

```json
{
  "type": "event",
  "event": "message.delta",
  "sessionId": "ses_...",
  "payload": {
    "role": "assistant",
    "text": "..."
  },
  "createdAt": 1781510400000
}
```

## 5. 事件类型

第一阶段事件集：

| 事件 | 说明 |
|------|------|
| `session.created` | 会话已创建 |
| `session.updated` | 会话状态变化 |
| `message.delta` | 助手流式文本片段 |
| `message.completed` | 助手消息完成 |
| `tool.started` | 工具调用开始 |
| `tool.output` | 工具输出 |
| `tool.completed` | 工具完成 |
| `permission.requested` | Agent 请求用户批准 |
| `preview.updated` | 文件或 diff 预览变化 |
| `error` | 统一错误事件 |

## 6. 数据落点

建议分阶段落点：

- `tools/agent-bridge/`：桌面 Bridge 服务和 Provider Adapter 源码，对外发布为 npm 包 `@dlzz/agent-bridge`。
- `docs/agent-bridge-architecture.md`：架构说明和协议草案。
- `entry/src/main/ets/features/agentBridge/`：后续 App 业务客户端、状态模型、页面 ViewModel。
- `entry/src/main/ets/pages/agent/`：后续 App 业务页面。
- `ngf_framework/src/main/ets/network/`：只有当 WebSocket/SSE/流式事件能力足够通用时再下沉。
- `ngf_framework/src/main/ets/data/`：只有当会话缓存、连接配置或加密存储形成通用能力时再下沉。

## 7. 安全基线

第一阶段必须满足：

- Bridge 默认只监听 `127.0.0.1`。
- 允许用户显式配置 host 后再监听局域网地址。
- 所有非 `/health` 请求必须携带 Bridge credential：bearer token，或 bcrypt 模式下通过同一 Bearer/查询参数通道传输的密码。
- bearer token 由 Bridge 首次启动生成或通过环境变量传入；bcrypt hash 只允许由本机 CLI 从显式密码环境变量生成，固定 cost 12，Bridge 不保存明文密码。
- 空 Host allowlist 仅允许 `localhost`、`*.localhost` 与 IP 字面量；DNS hostname 必须显式加入 allowlist。
- WebSocket 每次升级必须携带新的 `clientId/appNonce`，nonce 缺失、非法或重放会在升级前拒绝；认证模式切换或 token 轮换会使既有 WebSocket 失效。
- trusted-device registry 只用于管理和审计，不表示客户端私钥证明；App 对 Bridge 主机签名的信任与传输 credential/TLS 是独立安全层。
- 不在 Git 中保存 token、主机地址、私钥、第三方账号凭据。
- Provider Adapter 不允许默认执行危险 shell 命令；权限请求必须统一进入 `permission.requested`。

## 8. 实施顺序

1. API 基线回到 HarmonyOS 6.1.0 (API 23)。
2. 已搭建 `tools/agent-bridge`，提供 HTTP/WS 协议和 mock provider，并已发布为 npm 包 `@dlzz/agent-bridge`。
3. 在 App 侧新增连接配置与会话状态模型。
4. 新增 Agent 主页面：主机列表、会话列表、消息流、工具/预览面板。
5. 完善 OpenCode provider 的事件流订阅与权限映射。
6. 接入 Codex provider。
7. 接入 Claude Code provider。
8. 接入 OpenClaw provider：CLI 路径使用 `openclaw agent --message`；Gateway 路径使用本机 `/v1/models` 与 `/v1/responses` SSE，按 `x-openclaw-session-key` 绑定 Bridge session。
9. 接入 Hermes provider：CLI 路径使用 `hermes chat --quiet -q`；Studio 路径优先 Socket.IO `/chat-run`，失败时回落到 `POST /api/chat-run/runs`。
10. 再评估是否需要 SSH 隧道、桌面端安装器、配对码和局域网发现。

## 9. OpenClaw 与 Hermes 接入边界

- Provider ID：`openclaw`、`openclaw-gateway`、`hermes`、`hermes-studio`。
- CLI 路径作为 v1 必达能力，未安装命令时通过 doctor 标记为 unavailable。
- Gateway/BFF 路径只面向本机或可信内网，不建议暴露到公网。
- OpenClaw Gateway token 只读取 `AGENT_BRIDGE_OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_TOKEN`。
- Hermes Studio token 只读取 `AGENT_BRIDGE_HERMES_STUDIO_TOKEN` / `HERMES_STUDIO_TOKEN` / `AUTH_TOKEN`。
- App 端不把 OpenClaw/Hermes 标记为 OpenCode-compatible；文件预览、diff、revert 等 OpenCode 专属能力继续只对 `opencode`、`deveco`、`mimo` 开放。

## 10. Provider usage 与 quota snapshot

Provider usage 查询分为两条链：RPC 负责向当前 Provider 或受控 HTTPS endpoint 请求最新状态；UsageManager 负责保存可用于历史聚合的规范化事件。`provider.usage.list` 成功返回后，Bridge 只从包含真实 `remaining`、`limit` 或 `resetAt` 的窗口生成 `kind=quota`、`estimated=false` 事件，并把 `hostProfileId`、`sessionId`、`agentId`、`providerId` 和窗口名称写入事件作用域。结果若带 `stale: true`，即使窗口仍有数值也只作为只读快照返回，不会写入新的 Usage event。

quota event id 是配额内容的 SHA-256 摘要，而不是刷新时间，因此同一快照重复刷新不会增加历史事件，数值或 reset 时间变化才会产生新事件。写入沿用现有 `UsageManager.record()` 幂等和原子持久化，完成后通过 `usage.updated` 只通知相同 `hostProfileId` 的连接；缺少 host 的旧客户端仍只回源连接。

Provider 返回的 plan、details、warnings、message 和 remediation 在进入公开 RPC 或持久化前进行长度限制、控制字符清理以及 Bearer/token/private-key 脱敏。配额缺失时保持 unavailable，不以估算值填充 quota；stale 只表达 freshness，不伪造 unavailable 或刷新成功。真实 Provider 凭证、套餐端点、长会话 compaction 和现场设备数据仍属于现场验收边界。

## 11. Browser host capability boundary

Browser host 注册是外部执行器的能力声明，不等同于 Bridge 内置平台适配。公开 host DTO 可选携带 `hostKind`、`runtime`、`capabilitySource`、`readiness`、`supportedPlatforms` 和 `capabilityWarnings`。旧注册消息缺少这些字段时使用 `external`、`declared`、`ready` 和当前 `platform` 的安全默认值。

Bridge 只把 `readiness=ready` 且命令/动作显式匹配的 host 放入 dispatch 候选；`degraded` 或 `unavailable` host 仍可列出用于诊断，但执行返回 `browser_host_not_ready`。自称 HarmonyOS 的 host 必须声明 `capabilitySource=platform`，否则返回 `browser_host_capability_unverified`。R95 新增 `browser-platform-host.js` 适配器契约：`hostKind=harmonyos` 或 `capabilitySource=platform` 的注册必须经过适配器的可用性和注册校验；默认 Bridge 使用不可用适配器并返回稳定的 `browser_platform_host_unavailable`，不会把客户端自报 metadata 当成平台实现。`serverInfo.features.browserPlatformHost` 现在由适配器可用性派生，只有真实适配器注入并通过校验时才会开启。当前仓库仍只提供 Chromium CDP host；平台 host、HarmonyOS WebView 全量动作和真实页面安全行为必须由受支持 adapter/现场证据单独开启。

Host 提供的 `capabilityWarnings` 在注册和更新进入公共 DTO 前统一经过 `normalizeCapabilityWarnings()`：仅接受字符串，清理控制字符并限制数量/长度；所有带 `scheme://` 的 URL 都经过协议感知过滤，HTTP/HTTPS/WS/WSS 与非支持协议（如 `file://`、`ssh://`、`ftp://`）只保留稳定 `[url]` marker，不公开 authority、路径、查询参数或凭证；Windows/Unix 绝对路径、Bearer/token/password/secret/authorization/cookie/api-key 等 credential 片段也被替换并去重。该规则同时覆盖 host list、lifecycle event、公共 host result、Browser logs 和 App/Web 展示，避免外部执行器把登录态、目录结构或可复用凭证通过诊断 warning 泄露；原始 warning 只在 Bridge 内部短暂使用，不能进入日志、持久化状态或 diagnostics export。未知 warning 仍保留为脱敏后的普通诊断文本，不改变 readiness 或 capability gate。

平台 Browser host 的 `isAvailable()` 与 `validateRegistration()` 属于外部适配器边界。`createBrowserPlatformHostAdapter()` 和 `validateBrowserPlatformHost()` 都捕获适配器异常：可用性探测异常固定归一化为 `browser_platform_host_unavailable`，注册校验异常归一化为 `browser_platform_host_rejected`；不得让第三方适配器异常穿透 RPC，也不得仅凭 `hostKind=harmonyos` 发布平台能力。该 fail-closed 规则由 Browser manager smoke 覆盖，真实平台适配器仍需独立现场验收。

`browser.page.logs` 也在 manager 公共结果边界执行独立的递归 allowlist：日志条数、对象深度、键数和 UTF-8 文本均有上限；文本沿用 URL、路径、Bearer/credential 脱敏，`headers`、`cookies`、authorization、token、secret、password 和 private-key 等键被丢弃。外部 host 可以继续返回方法、类型、请求 id、错误摘要和字节统计等低风险字段，但原始日志对象不会直接复制到 App/Web，超限结果带 `truncated` 标记。该边界不替代真实 Browser host 的登录态隔离或页面内容安全策略。

外部 host result 离开 broker 前还必须经过统一递归公开 DTO。`copyHostResult()` 限制对象深度、键数、数组条目和 UTF-8 文本大小；headers、cookies、token、secret、password、authorization、private-key、cwd、args、env 和文件/下载路径等键会被丢弃。URL 只允许 HTTP(S) 或 `about:blank`，移除 authority 凭证并删除 token/secret 等敏感查询参数；诊断 message/error/warning/remediation 继续执行路径和 credential 脱敏。日志和下载 DTO 在此基础上保留更严格的专用 allowlist，因此嵌套字段不能绕过 R92/R93 的公开边界。

### Browser permission state 与下载目录状态

Browser workspace permission 通过 `BrowserAutomationManager.publicPermissionState()` 生成脱敏公开 DTO，字段只包括 `workspaceId`、域名 allowlist、`downloadDirectoryConfigured` 和 `updatedAt`。`browser.permission.get`、permission preview/confirm 以及 `browser.permission.updated` 事件复用同一 DTO；旧客户端仍可读取历史扁平字段，但顶层兼容字段 `downloadDirectory` 只返回固定相对标识 `.agent-bridge-downloads`，不再返回工作区绝对路径。Browser action 的内部命令仍使用受管 workspace 子目录绝对路径，Bridge `sanitizeDownloadHostResult()`、`sanitizeDownloadListHostResult()` 和 Chromium CDP host 都在公开结果边界移除绝对 `downloadDirectory`、`downloadPath`、`filePath`、`path` 与 `filePaths`，避免把本机目录结构带入 UI、日志或诊断导出。

HarmonyOS App 的 `AgentBridgeBrowserPermissionState` 以当前 workspace 为作用域，parser 同时兼容嵌套 `permission`、旧扁平字段和缺字段响应。Browser 面板只展示 allowlist、下载目录是否受 Bridge 管理和更新时间；结果应用前校验 workspace，host/workspace 切换、断开和页面释放会清理旧快照。permission 修改仍遵循现有 preview -> confirm plan，不因状态 DTO 增加旁路写操作。

该状态模型只完成 App 可见的安全状态闭环，不代表 Bridge 已具备 HarmonyOS 平台 Browser host。当前 `browserPlatformHost` 仍为 `false`；平台 host、真实上传/下载、恶意页面、登录态隔离和真机全量动作继续由第 16、23D 的 FIELD 轨道验收。

R72 进一步收敛下载结果的公开 URL：Browser manager 在接收外部 host 的 `page.action(download)`/`download.list` 结果时，只保留无凭证的 HTTP(S) URL；会移除用户名、密码、控制字符、非 HTTP(S) 和超长 URL。CDP host 的 `download.list` 在离开 host 前使用同一语义清理。内部命令仍可携带 Bridge 生成的受管绝对下载目录和 host 所需的原始下载 URL，但这些值不会进入公开 RPC DTO。可重复验证 `node scripts/check-browser-automation-manager-smoke.js`、`node scripts/check-browser-cdp-host-smoke.js` 和 `node scripts/check-browser-automation-live-smoke.js`。

### Browser action target snapshot

Browser `page.action` 的 preview/confirmed 结果可选返回受限 `target` 摘要，字段固定为 `workspaceId`、`agentId`、`hostId`、`instanceId`、`pageId` 和规范化 `action`。该摘要用于 App/Web 在确认和结果状态中展示操作边界，不携带 URL、文件路径、evaluate 脚本、上传内容、凭证、连接 id 或 host 能力内部信息。Preview 仍把完整 action payload、文件 realpath/size/mtime/SHA-256 和当前 host capability binding 纳入 digest；confirm 只消费一次 plan，并在 dispatch 返回时用实际 host id 覆盖外部 host 的同名字段。旧客户端或旧 Bridge 缺少 `target` 时，App parser 使用已知安全顶层字段回退，不能从普通 warning、URL 或路径猜测目标。该边界由 `check-browser-automation-manager-smoke.js`、`check-browser-automation-live-smoke.js` 和 App parser 测试覆盖；真实平台 host、恶意页面、登录态、上传/下载和 HarmonyOS App 全量动作仍需现场验收。

R135 在 R111 的公开目标摘要之上增加真实页面状态绑定。对需要确认的敏感 action，Bridge 仅向选定 host 发起只读 `page.snapshot`；snapshot 经过现有公共 DTO 的深度、键数、数组、UTF-8 和敏感字段限制后，只在内存中生成 `pageId + instanceId + snapshot` SHA-256 digest。plan 保存请求/host binding、target-state mode/digest 和 warning，不保存页面正文；confirm 重新获取同一 host/page snapshot，digest 不同返回 `browser_target_changed` 并停止派发。platform/HarmonyOS host 缺少 `page.snapshot`、返回失败或非法结构时 fail closed；旧 external/CDP/native/custom host 继续允许 legacy confirm，但返回 `browser_target_snapshot_unavailable` warning。该阶段由 `check:r135`、manager smoke 和 Browser live smoke 覆盖，真实平台 host、页面导航/替换、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍需现场验收。

R136 将该结果接入 Web 控制端：`src/web/compatibility.js` 以强类型 parser 归一化 action target、target-state mode、preview/confirm、failureCategory、remediation 和 warnings；缺字段旧 Bridge 使用安全的 `unknown` mode 与顶层摘要回退。`src/web/app.js` 的 Preview/Confirm 只消费归一化结果，legacy host 的 snapshot warning 进入确认提示和完成状态，`browser_target_changed` 保留稳定错误与 remediation，敏感参数和页面正文不展示。`check:r136` 与 Web contract/live/session smoke 覆盖该接线；真实浏览器多标签、平台 host、恶意页面/登录态、长流、上传下载和 HarmonyOS App 全量动作仍需现场验收。

R113 进一步补齐 HarmonyOS App 的 Browser upload 选择链：Agent Home 只允许把当前 workspace 文件列表中、同一 `workspaceId` 下的普通文件转换为规范化相对路径并填入 upload action；目录、绝对路径、URI、路径穿越、空路径段和失效/跨 workspace 选择会在 App 侧直接降级。Bridge 仍是最终 realpath、符号链接、大小、mtime 和 SHA-256 校验边界，App 不显示或传递 Bridge 主机绝对路径。该策略由 `AgentHomeBrowserUploadPolicy` 与 Hypium 测试覆盖，资源按钮只在存在有效当前文件选择时启用；本次 HAP 与 Browser smoke 证据记录在 R113 进度条目中。

R126 补齐 Agent Home Browser unsolicited event 的生命周期边界。`AgentBridgeBrowserResult` 保留可选 `eventKind` 和 host workspace scope，`AgentHomeBrowserEventScopeCoordinator` 在页面不可见、workspace 不匹配、host/instance/page 选择冲突或 host unregister 不是当前选中 host 时 fail closed。workspace assignment 统一经过 `updateActiveWorkspaceId()`，会清除旧 Browser request coordinator、host/instance/page 列表、日志、下载、截图和 permission 快照，避免 workspace/远程 session/fork/import 切换期间的迟到响应覆盖当前 UI。`check-browser-app-scope-smoke.js` 与 Hypium parser/coordinator tests 覆盖该源码契约；这仍不代表真实平台 host、恶意页面/登录态、上传下载或 HarmonyOS App 全量 Browser 动作已经完成。

R127 在同一 App gate 上增加 `AgentHomeBrowserCapabilityPolicy`。显式 `hostKind=harmonyos` 或 `capabilitySource=platform` 的 host 只有在 Bridge 同时发布 `browserHostCapabilityMetadata=true` 与 `browserPlatformHost=true`、host `connected=true` 且 `readiness=ready` 时才可参与 command/action dispatch；缺少平台 capability、缺 metadata 或 degraded/unavailable 均 fail closed，并使用既有受控 not-ready/capability 状态。external/CDP host 在旧 Bridge 缺 metadata 时仍保持 legacy connected 兼容，新 Bridge 有 readiness 元数据时只接受 ready。该策略由 Hypium 纯逻辑测试和 `check:r126` 静态接线断言覆盖；平台 adapter 和真实浏览器动作仍需现场验收。

R128 进一步收紧平台 host 的 action capability 注册。显式 `hostKind=harmonyos` 或 `capabilitySource=platform` 的 host 如果声明 `page.action`，必须同时提供非空 `supportedActions`；缺少字段返回 `browser_host_action_capabilities_required`，显式空集合返回 `browser_host_capabilities_invalid`，两种情况都不会注册 host 或创建 action plan。非平台的 external/CDP/native/custom host 仍兼容只声明旧 `supportedCommands` 的注册方式，但未声明的具体动作在 preview/dispatch 前返回 `browser_action_unavailable`。该边界由 Browser manager smoke、Browser live smoke、`check:browser` 和 Node 语法检查覆盖；平台 adapter、真实页面动作和 HarmonyOS 真机现场仍需单独验收。

R129 为 Browser host 增加 Bridge 内部 registration generation。成功重注册同一 connection/hostId 前，所有旧 pending command 以 `browser_host_reconfigured` 结束；dispatch 保存 host generation，handleHostResult 重新校验当前 generation，page.action 的 hostBinding digest 也包含该代际。generation 不进入公共 DTO，旧 App/Bridge 协议不变；跨连接 hostId 冲突仍使用既有 owner gate。该生命周期边界由 manager smoke、独立 host generation smoke、Browser live/CDP/protocol smoke 覆盖，真实平台 host 和页面现场行为仍需 FIELD 验收。

## 12. Voice TTS client correlation

远程 TTS 请求使用可选的 `clientRequestId` 作为 App 侧关联键，Bridge 仍保留内部 `requestId` 作为运行时资源标识。Bridge 只接受受限字符集和长度的 client id，并在 `tts.started`、`tts.ready`、`tts.failed`、`tts.cancelled` 和 RPC 结果中回显；旧客户端缺少该字段时继续使用内部 request id。

当 `voice.tts.stop` 携带 client id 时，VoiceManager 先在当前连接 owner 范围内按 client id 查找，再兼容内部 request id，避免过期内部 id 误停另一条播放。App 为每次远程播放生成新的 client id，同时保存 speak RPC id 和 Bridge 内部 id；停止时记录取消快照并立即清除当前活动关联。只有当前 client/internal/RPC id 的结果能进入播放状态机，取消快照对应的迟到 response/event、缺少可关联 id 的旧事件和其他连接的结果均被丢弃。

该关联只解决请求与 UI 状态的完整性，不宣称 Provider 已支持真正取消、网络重连或平台音频路由；真实 Provider、弱网、蓝牙/来电、前后台和权限现场仍由 Voice FIELD 轨道验收。

## 13. Voice microphone permission semantics

Voice platform capability snapshots expose `microphonePermission` and the optional `permissionRemediation` field. The shared media contract uses `NGFVoicePermissionRemediation.NONE` after a successful permission check and `NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS` after a denied request. The failure category is the stable `permission_denied`; platform-specific settings paths and permission-store details are never exposed to the App or persisted state. Agent Home renders the remediation through localized resources and keeps the action non-destructive; opening system settings remains a future field operation rather than a server-provided command.

## 14. Provider capability publication

The Bridge publishes protocol-level feature flags in `serverInfo.features`, while each Provider descriptor carries the narrower runtime capability gate. `ProviderRegistry` is the single normalization point: `metadataGeneration` is true only when the registered Provider exposes a metadata method and declares the capability; `usageEvents` is true only for Providers that declare `usageEventsAvailable`; and `providerUsage` is true only for a native `getUsage()` adapter or a safe HTTPS usage endpoint without embedded credentials. The top-level `usageEvents` and `metadataGeneration` flags use the same runtime registry checks, so an invalid Codex runtime or an `exec` fallback cannot enable a control that it cannot serve. This prevents a static catalog descriptor from enabling an App control that the active runtime cannot serve. Legacy descriptors with missing optional fields remain safely false at the descriptor level, while the existing global RPC feature flags preserve old client compatibility.

Agent Home applies the same distinction at the selected Provider boundary. A descriptor that explicitly includes `capabilities.usageEvents` is authoritative for the Usage event entry; a legacy descriptor that omits the optional field continues using the global feature flag for compatibility. This prevents a Provider-specific control from being shown solely because another registered Provider can emit usage events.

Descriptor normalization and top-level aggregation both require `providerRuntimeEnabled()`: a Provider with a runtime configuration error or an `exec`-only fallback cannot publish `usageEvents` or `metadataGeneration` merely because its static descriptor contains those fields. `providerUsage` remains a separate endpoint/adapter capability because an independently configured HTTPS quota source can be readable even when the chat runtime is unavailable.

The regression contract is exercised by `check-provider-runtime-capability-smoke.js`: it checks no-producer, Mock producer, invalid-runtime and endpoint-only cases, including HTTP and embedded-credential rejection. This is a capability-publication guard only; it does not prove live Provider quota, billing, long-session compaction, metadata service availability or device UI rendering.

## 15. Usage budget currency integrity

Usage and budget values preserve the distinction between an unavailable field and a measured value. `AgentBridgeUsageBudgetRecord.currency` defaults to an empty string when the Bridge does not provide a real currency. Agent Home keeps that empty value through initial state, budget responses, scope changes, clearing and reset; it never synthesizes `USD` as a UI default. A cost budget is accepted only when the user supplies an explicit currency, while token-only budgets remain valid without one. This keeps App budget editing aligned with Provider usage producer semantics, which do not invent a currency when a Provider omits it.

## 16. Metadata turn usage accounting

Metadata generation is an isolated Provider turn, but its measured consumption must still be visible in the Usage view. A Provider may optionally return a `usage` object alongside the metadata suggestion. `metadata-scope.js` normalizes that object into a bounded `kind=metadata` event: token fields accept only non-negative safe integers, cost accepts only finite non-negative values, currency is optional and upper-cased, and invalid or empty usage is omitted rather than represented as zero.

The Bridge binds the normalized event to the current connection `hostProfileId`, Agent `sessionId`/`agentId`, Provider id and `window=session` before calling `UsageManager.record()`. The existing event id deduplication then makes retries idempotent. A newly recorded event is delivered through the existing host-scoped `usage.updated` route; metadata RPC responses expose only the optional `usageEventsRecorded` count, not raw Provider payloads. Codex App Server preserves the completed metadata turn usage snapshot so this path can account for real token/cost data without adding metadata text to the primary chat timeline. Providers without usage data remain compatible and continue returning only the suggestion fields.

## 17. Usage aggregate integrity

Usage summary quota records are keyed by `providerId`, quota source and the Provider-reported window name. Concurrent hourly, daily and monthly windows therefore remain separate instead of the last snapshot overwriting earlier windows. Token totals are accumulated only while the result remains a non-negative safe integer; cost totals are omitted when finite inputs would overflow. Budget token limits use the same safe-integer rule, while cost limits remain finite non-negative values. These guards preserve unavailable semantics and prevent `Infinity` or truncated totals from entering App usage and diagnostics views.

For repeated snapshots in the same window, the summary selects the event with the newest normalized `occurredAt`. Equal or invalid timestamps use a stable `eventId` tie-break, so delayed older responses cannot regress the visible quota while the append-only event history remains available for diagnostics and recovery.

The App quota parser keeps the Bridge-reported window name instead of forcing it into the session/day/month budget set. Custom names such as hour or rolling-7d are accepted only after trimming and bounded safety validation: empty values, control characters, Unicode line separators, path separators, dot path segments and values over 64 characters remain unavailable. Usage summary and budget windows retain their existing session/day/month compatibility contract. Agent Home displays an accepted custom quota name directly, while empty or rejected names use the existing unavailable/session fallback.

Usage event parsing applies the same distinction. The App parser reads `kind` and the quota evidence fields before normalizing `window`: quota events, or legacy events carrying `quotaRemaining`, `quotaLimit`, `quotaResetAt` or `quotaSource`, retain a safely validated Provider window such as `hour` or `rolling-7d`. Turn, metadata, compaction and other ordinary usage events continue to accept only `session`, `day` and `month`, so the quota compatibility extension cannot widen the existing usage/budget query contract. Invalid custom names remain unavailable.

## 18. Provider recorded session evidence

The Bridge keeps a sanitized protocol-shape fixture for multi-turn Codex, OpenCode and Gateway responses. `check-provider-recorded-session-smoke.js` runs the real adapter normalizers, replays both Codex compaction arrival orders, verifies the latest quota snapshot after a reset, exercises all four metadata kinds with optional measured usage, and reconstructs `UsageManager` from the same persisted state to model disconnect/reconnect recovery. Codex compaction events use a deterministic identity derived from the provider item/compaction id, turn id, or a bounded timestamp/reason/token snapshot. The adapter keeps a bounded set of emitted event ids, so notification/item replays do not publish duplicate `usage.updated` events while the existing UsageManager event-id deduplication remains the persistence backstop. The recorded-session smoke also creates a new Provider instance and replays the same compactions, proving that event ids remain stable across provider recreation rather than relying on process-local sequence state. This is a source-level regression guard only; it does not represent live Provider billing, credentials, network loss or device evidence.

## 19. Web Session Experience

The Web UI consumes the same M5 Bridge protocol instead of creating a parallel session store. When advertised by `serverInfo.features`, the Session Experience region loads `message.queue.list`, `usage.summary.get`, `usage.events.list` and `usage.budget.get` for the current `hostProfileId + workspaceId + agentId + sessionId + providerId` scope. Queue rows expose only bounded status/attempt/failure summaries and use `message.queue.cancel` or `message.queue.retry`; duplicate clicks are disabled while the scoped operation is in flight.

Usage renders actual and estimated token categories separately, groups costs by currency, preserves unavailable values, lists Provider quota windows and recent usage/compaction events, and shows non-blocking budget warnings. `usage.budget.set` accepts explicit token/cost limits and currency; clearing a budget sends an empty-limit request. The UI never invents a currency or quota value.

Metadata generation is a preview-only Provider turn. The Web UI uses an explicit request id so `metadata.generate.cancel` can cancel the active request. Suggestions and alternatives remain editable and copyable; `sessionTitle` is applied through the existing `agent.update` RPC, while branch, commit and pull-request suggestions are handed to the existing Git/GitHub preview/confirm or dry-run/confirm plans. The metadata service never writes workspace or remote Git state directly.

Web messages consume the same optional rich-content AST as the App. `src/web/compatibility.js` bounds node count, UTF-8 text, code lines, file scope, todo contract and link protocols; unknown or unsafe nodes become `fallback`. `src/web/app.js` renders only text nodes, bounded `pre` blocks, safe external links, current-workspace file buttons and structured tool/todo/warning cards. Legacy text-only messages remain unchanged, and `rich-content.css` is served as a same-origin static asset under the existing CSP.

Experience refreshes capture the connection generation and complete scope before issuing RPCs. Results are committed only when the generation and current host/workspace/agent/session still match, so a reconnect or host/session switch cannot overwrite the visible state. Missing feature flags or missing optional fields hide only the enhancement and leave legacy chat/workspace behavior intact. The contract and live smoke are `check-web-session-experience-smoke.js` and `check-web-session-experience-live-smoke.js`; real Provider data, old Bridge, multi-tab browser and HarmonyOS App field behavior remain separate acceptance gates.

### App download URL credential boundary

The App's ordinary Bridge download flow receives a one-time path such as `/download/<token>`. `NGFAgentHomePage` normalizes the configured WebSocket/HTTP endpoint and joins it with that server-issued path; it does not append the host credential as a query parameter. The Bridge HTTP handler remains the only consumer of the path token through `WorkspaceService.consumeDownloadToken()`. This keeps credentials out of proxy/access logs without changing the existing download RPC or route. `check-protocol-alignment-smoke.js` guards both sides of this boundary. The rule applies to message attachment images, workspace preview images and generic Bridge downloads; Browser host downloads have their separate sanitized public DTO boundary.

The same App boundary rejects download paths that are not a single relative `/download/<token>` route. External schemes, extra segments, query/fragment text, backslashes, percent encoding and control characters are invalid and stop before an HTTP request is created. This is intentionally a path-shape check rather than a token character allowlist so older Bridge token alphabets remain compatible; authority and one-time token ownership remain server responsibilities.
### R137 Web Browser host DTO 与平台 readiness gate

Web Browser 工作台通过 `normalizeBrowserHostList()` 接收 `browser.host.list`，同时兼容当前 `{ hosts: [...] }` 和旧数组响应。每个 host 归一化为公开 DTO，限制命令、action、platform、workspace 和 warning 数量/长度，不把未知字段直接传入 UI。`browserHostGate()` 是 Web 命令和 action 的唯一能力门：平台 host（显式 `platformHost`，或 `hostKind=harmonyos`/`capabilitySource=platform`）必须同时看到 `browserHostCapabilityMetadata=true`、`browserPlatformHost=true`、`connected=true` 与 `readiness=ready`；缺失或不满足时只显示不可用状态。非平台 external/CDP/native/custom host 在旧 Bridge 缺失 readiness/connected 时使用 legacy/connected 安全默认值，显式 degraded/unavailable 或 disconnected 仍阻断。该 gate 只反映 Bridge 公开能力，不替代真实平台 adapter、页面安全、登录态隔离和现场动作验收。
### Provider usage 公共结果脱敏（R138）

Provider usage adapter 返回的 `message`、`warnings`、`details`、套餐标签和窗口名称均视为不可信公开文本。`redactProviderUsageText()` 在 `normalizeProviderUsage()` 组装 RPC DTO 前执行有界 UTF-8 清理，先过滤 private key/Bearer/token 等敏感文本，再移除 HTTP(S) URL userinfo 与常见 token/secret 查询参数。脱敏后的 DTO 才能进入 WebSocket 响应和 `UsageManager` 的 quota event；原始 Provider 文本不写入普通状态或持久化 store。R138 smoke 覆盖三类公开字段和 URL/query 凭证，真实 Provider 数据仍由现场验收轨道负责。

### Metadata 摘要输入脱敏（R139）

`metadata.generate` 发往 Provider 的 timeline/diff 摘要使用 `redactSummary()` 的 allowlist 边界。除控制字符、private key、Bearer 和常见 token 文本外，R139 还移除 HTTP(S) URL userinfo 与敏感 query 参数，确保独立 metadata turn 不接收可恢复的 URL 凭证。摘要仍受 UTF-8 大小限制，原始正文不会写入 metadata state；scope、Provider 和 workspace 校验保持不变。

### Fork context 输入脱敏（R140）

消息级 fork 的历史 attachment 使用 `AgentManager.redactForkHistoryText()` 在持久化前执行边界脱敏。除了既有 token、header、private-key 和 Provider token 规则，R140 还移除 HTTP(S) URL userinfo 及敏感 query 参数，避免 child 首次 Provider turn 重新看到父会话中的 URL 凭证。该处理仍发生在 context digest 和一次性注入之前，原始 tool input/output 不进入 attachment。

### R141 Web composer token 与消息发送边界

Web composer 的候选索引严格绑定当前 `hostProfileId + workspaceId`：workspace、agent 和已加载文件只能经安全 DTO 生成候选，文件 token 只接受 workspace-relative path，用户普通文本中的 `@` 不会被隐式信任。候选选择后才生成带稳定 id、kind、label、value 和 scope 的 token；输入、键盘选择、删除和失焦行为均通过 DOM API 构建，不使用 `innerHTML` 或动态脚本执行。

发送路径优先使用 `message.send`，将 `clientMessageId`、`queuePolicy` 和 `composerTokensJson` 交给 Bridge；旧 Bridge 不认识该 RPC 时才回退 `agent.send`。两条服务端路径都在进入 Provider 前调用 `sanitizeComposerTokens()`，以连接 host 为权威 scope，重新校验 token kind、workspace 和相对文件路径。发送失败保留草稿，成功后清理文本/token；workspace、agent、归档、断线和重新登录会清理旧 scope token。`check-web-composer-smoke.js` 与 `check:r141` 为该边界的源码回归证据，真实浏览器、多标签、长流和 HarmonyOS App 仍是现场门。

### R151 HarmonyOS App Browser action surface

Agent Home 的 Browser 控制面复用 Bridge 的 capability-based host broker。页面状态 `browserScreenshotFullPage` 只影响用户显式发起的 screenshot 请求，默认保持 `false`，不会扩大 host capability；Bridge 返回的 `fullPage` 仍是可选字段，旧 Bridge 安全回落。App action registry 覆盖 click、fill、type、keypress、hover、select、drag、upload、scroll、download 和 evaluate，敏感动作继续通过 Preview -> Confirm，上传继续受 workspace 文件选择和 realpath policy 约束。

请求 envelope 的 `id`/`requestId` 关联、host/workspace/page scope gate、PNG/JPEG/WebP DTO 校验和 lifecycle cleanup 与既有 Browser renderer 共用。R151 的 `check:r151`、`check:browser` 和 SDK 23 HAP 构建证明 App 源码接线；真实 platform host、CDP 页面、恶意页面/登录态、上传下载、弱网长流和真机动作仍属于现场验收，不得据此把第 16、23D 提前标记为已实现。

### R152 Web Browser full-page screenshot

Web Browser 工作台复用同一 `browser.page.screenshot` 协议和 compatibility parser。`screenshotFullPage` 是页面内非敏感 UI 状态，默认 `false`；只有用户勾选 checkbox 后请求才携带 `fullPage=true`，不会修改 host capability、permission 或 page owner。截图结果仍由 `normalizeBrowserScreenshot()` 限制 MIME、Base64、实际 magic bytes 和大小，并只用安全 DOM API 创建受限 `data:` URL 预览。

请求提交沿用 connection generation、selected host 和 selected page 三重 gate，因 reconnect、host/page 切换产生的迟到截图不会更新当前 UI。旧 Bridge 缺少字段时保持 `false`；真实 platform adapter、页面隔离、登录态和上传下载仍是现场边界。
