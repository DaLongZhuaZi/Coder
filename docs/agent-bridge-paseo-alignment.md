# App / Bridge / Paseo 功能对齐核查与实施清单

更新时间：2026-08-16

> 2026-08-16 R182 证据：App 用量面板入口修复 + Bridge 会话再水合 + Web 刷新风暴治理（第 22/23B 项）。**App（第 22 项 App 侧闭环）**：命令面板「会话数据」竖屏可用（FOCUS_RIGHT_PANE 非 EXPANDED 改为 openSheet(SESSION_DETAILS)，enabled 恒 true）；真机发送 usage-test 后会话数据面板渲染真实用量——压缩记录 200→80 automatic、配额 mock/mock-provider 剩余 90/上限 100、最近用量事件「真实用量 · 输入: 10 · 输出: 5 · 总量: 15 · USD 0.15」+「估算用量 · 总量: 20」（截图 screen-r182c.jpeg）；Bridge 作用域复验 usage.summary.get eventCount=3/actual=1/quota 90/100。**Bridge 会话再水合**：重启后 agent 记录在但 mock 运行时会话丢失 → message.send/session.messages 报 session_not_found（真机+HTTP RPC 复现）；修复 provider.ensureSession 契约 + ensureProviderSessionForAgent 再水合 + message.send/session.messages/attach 三处 ensure 重试；check:r182（重启→再水合→发送成功）接入 postcheck；现场 Bridge 重启后旧会话 message.send accepted:true。**Web 刷新风暴（23B）**：5 个旧 Web 标签 15s 全量刷新（4.1s git 枚举×5 + 失效会话轮询）致 Bridge 单核 100% CPU 并最终事件循环停摆；app.js 增加 document.hidden 跳过 + sessionMessagesStaleFor 停止轮询失效会话，契约 smoke 4 条断言。HAP 14,558,715 bytes SHA-256 `F8199859581F45A2CCC50B785361CD3FBEA76271B3EC5A59BE126B92E42E3FEC`；npm run check + postcheck 双 EXIT=0。

> 2026-08-16 R181 证据：App 端浏览器自动化 workspaceId 映射缺陷修复 + 真机全面板现场闭环（第 16/23D 项 App 侧）。缺陷：`browserWorkspaceId()` 只返回 App 本地复合 workspaceId（`host_..._wks_...`），Bridge 按纯 id（`wks_zaj5-VK2zd3LSfbb`）校验 → 全部 browser RPC 被 `browser_workspace_required` 拒绝（R180 观察到的 `app_req_449` 根因）。修复：优先取 `currentBridgeAgentRecord().workspaceId`，其次 `findBridgeWorkspaceRecordForLocalWorkspace(currentWorkspace()).workspaceId`，最后回退本地 id（`NGFAgentHomePage.ets`，备份 `.bak-r181`）。SDK 23 HAP 构建 + 真机安装启动（pid 52532），设备端布局/hilog/截图三重证据：`browser.host.list` 返回 `chrome-cdp-field / Chromium CDP / win32-cdp / capabilitySource:cdp / readiness:ready`（此前 fail-closed 空列表）、`browser.permission.get` 返回纯 `workspaceId:"wks_zaj5-VK2zd3LSfbb" domains:["127.0.0.1"] downloadDirectoryConfigured:true`、`browser.instance.list` 返回 `chromium-cdp connected:true`、`browser.page.list` 返回 8 个真实页面（R163 Field Test Page / NGF Agent Bridge ×5 / Example Domain / about:blank）、`browser.download.list` ok:true（tracking=cdp-events）；App UI 点页面「截图」按钮 → `browser.page.screenshot` 返回真实 Chrome PNG（mimeType=image/png + dataBase64，commandId `browser_2M5MddP3TtBPpzx0`）——真机写路径动作端到端完成；无页面选中执行操作时错误提示「浏览器操作失败。请刷新主机状态后重试。」fail-closed 渲染正常。HAP 14,558,784 bytes，SHA-256 `D916C77E7A339CCB582CA3A2242AEFBD02A784F3A2E7CF9B9927D9D47A683775`，`git diff --check` 退出码 0。

> 2026-08-16 R180 证据：设备解锁后 App 端面板全量现场验证（真机 ADA-AL00U + Bridge 0.1.4，截图/布局/hilog 三重证据）。**App 连接**：`NGFCoder / Coder / 25 会话 / 已连接` + mock.context loaded。**第 14 项 Fleet App 闭环**：Daemon 实例集群面板实测——实例总数 1、健康聚合 健康:1（stall 期间实测变化 不可达:1，实时状态更新真实生效）、Bridge 版本分布 0.1.4:1、TX_2 healthy · ins__UFSd3cb1roYlqDO、滚动重启/升级/回滚按钮、刷新实例→`正在查询实例状态...`→数据刷新、计划状态 preview 全 0。**第 34 项 App 诊断**：导出 JSON/文本 + daemon 分组报告现场。**第 23D 项 App Browser 面板**：主机/实例/页面/域名许可控制面完整渲染（fail-closed scope 隔离生效）。**第 21/33 项 Voice**：hilog 实拍 App 周期轮询 `voice.status` 消费完整 capability 矩阵（available:false + 8 项 fail-closed + streamingUpload:true）。**第 32 项**：自动化与协作（定时任务配置 + chat.room.list 操作已完成）。工作区 tab（TX_2 已连接 + 注册表校验 path valid）+ 数据 tab 现场；R174 遗留工作区已归档。真机实际录音/播放仍 FIELD。详见 `docs/agent-bridge-r180-device-app-panels-field-progress.md`。

> 2026-08-16 R179 证据：`workspace.changes.get` 未跟踪文件逐个 git 子进程缺陷修复（间歇 stall 根因，第 23B 项 Git/Diff 现场依赖）。缺陷：getChanges 对每个 untracked 条目单独执行 `git ls-files`（~380 个条目 → 380+ git 子进程/请求，60-90s+），Web UI 多标签 15s 刷新触发 → health 间歇超时。修复（`workspace-service.js`，备份 `.bak-r179`）：新增 `buildUntrackedFileMap` 一次枚举全部未跟踪文件按条目前缀分组（含单文件兜底），getChanges 循环查 Map——380+ 次 git 降为 1 次，行为等价。**验证**：修复后 `workspace.changes.get` 4.1s（branch=main、444 changes、diffSummary 完整）；Web UI Git 摘要实时渲染 `main · 445 changed` + 变更列表（modified/deleted + Diff/Stage/Discard 操作区）；health 稳定。codex exec discovery 慢仍是独立 FIELD。**R179b 稳定性闭环**：changes.get 按 rootPath 缓存（TTL 4s + sessionId 重映射 + git 写操作清缓存，连续调用 108/133ms）；missing-session discovery 冷却 30s→5min；codex 会话目录缓存 2s→30s；80s 连续监控 0 次 health 失败、git 进程峰值 0-16。详见 `docs/agent-bridge-r179-git-changes-batching-fix-progress.md`。

> 2026-08-16 R178 证据：Web UI 消息队列面板现场（第 22/34 项）。Queue 面板可见（feature 门通过），初始 `No queued messages for this session.`；经 Web UI composer 连续发送消息后渲染队列项（accepted + clientMessageId + Attempt 时间戳，R88 消费语义），消息本体正常送达会话。MCP/CLI live 由 postcheck 的 check:r58 在 R176 全量回归覆盖（EXIT=0）。详见 `docs/agent-bridge-r178-webui-queue-field-progress.md`。

> 2026-08-16 R177 证据：Web UI Metadata 生成/应用 + 工作区文件浏览现场。**Metadata（第 22/34 项）**：真实 Chrome 中 Metadata preview 面板 → Kind=sessionTitle + prompt → Generate preview → 状态 `Preview ready; edit before applying.` + suggestion（mock 回显 prompt）+ Copy/Apply/Cancel 操作区 → **Apply to session → 会话标题更新 + `Session title updated.`**，Bridge `agent.list` 确认 agent title 同步（metadata.apply 端到端：Web UI → Bridge → provider suggestion → apply → agent 记录）。**工作区文件浏览（第 23B/30 项）**：files-section 渲染真实工作区树（目录 + 文件大小 + Preview/Download），files-refresh 正常。详见 `docs/agent-bridge-r177-webui-metadata-files-field-progress.md`。

> 2026-08-16 R176 证据：Web UI Usage 面板看不到自身用量——hello host 身份缺陷修复（第 22/34 项）。缺陷：Web UI 的 hello 不携带 `hostProfileId`（`refreshAllInternal` 稍后才解析为 `'web-host'`），导致 Web UI 自身消息的 usage 事件被记录为 hostless，而 Usage 面板查询携带 `hostProfileId: 'web-host'`——两侧永远不匹配，面板显示 `No usage events for this session`（Bridge 侧 hostless 查询可见全部数据）；R9/R162 的 host 隔离使缺陷隐蔽（事件按来源连接投递，仅汇总查询为空）。修复（`src/web/app.js`，备份 `.bak-r176`）：hello 前解析稳定 host 身份 `state.hostProfileId = state.hostProfileId || 'web-host'` 并随 hello 携带，记录/查询两侧统一（跨 Web 标签共享同一 host scope，与 R149 多标签设计一致）。**现场验证**：真实 Chrome 刷新加载修复后，Web UI composer 发送消息 → Usage 面板完整显示 actual 10/5/15 + $0.15 USD + estimated 20 + quota 90/100 + compaction 200→80 + usage actual/estimated 事件明细（修复前全 unavailable）。契约 smoke 新增 hello host 断言通过。详见 `docs/agent-bridge-r176-webui-usage-host-fix-progress.md`。

> 2026-08-16 R175 证据：Web UI Terminal 面板现场（第 23B 项）。真实 Chrome 中完整走通：选择 agent → New → 终端列表 `Web Terminal · running` → 点击 Open 选中订阅 → **terminal-output 渲染真实 cmd.exe shell**（`Microsoft Windows [版本 10.0.26100.3476]` + 提示符 `F:\DevEcoStudioProject\Coder>`，system-conpty 后端，二进制帧流端到端）→ Web UI 输入命令 shell 回显（输入经 INPUT 帧到达 pty）。Bridge 侧 `terminal.create`/`terminal.capture`（captureBytes 持续增长）/agent-scoped `terminal.list` 正常。**语义确认**：`terminal.list` 对带 ownerAgentId 的终端只对携带相同 agentId 的请求可见（设计语义，非缺陷）。**环境治理**：删除 R174 测试遗留错误 workspace agent（rootPath 被 drive-relative 解析到 `...\tools\agent-bridge\DevEcoStudioProjectCoder`），其 15s 刷新与 codex exec discovery 共同造成间歇事件循环 stall（health 12s 超时）；删除并重启 Bridge 后恢复；codex exec 慢仍 FIELD。详见 `docs/agent-bridge-r175-webui-terminal-field-progress.md`。

> 2026-08-16 R174 证据：Web UI New Agent 对话框实现（第 23B 项现场缺陷修复）+ Diagnostics 导出现场（第 34 项）。现场核查发现 Agents 'New' 按钮无 click 监听器（仅 feature 门控渲染）。实现（index.html + app.js，备份 `.bak-r174`）：`new-agent-dialog`（Provider 下拉自 providerCapabilities 填充、空时回退 mock；Workspace path 预填；Create/Cancel），`openNewAgentDialog()`/`createAgent()`（`agent.create` → 成功关对话框、自动选中新 agent），监听器接线。现场验证：真实 Chrome 点击 New → 对话框打开 → 填路径+标题 → Create → **agent.list 7→8（`agt_zQeNBkk7hX1hR0Tn` | R174 Web New Agent | wks_DWumDyEnZkNg3FT0）**、新 agent 自动选中；契约 smoke 新增 dialog/provider/workspace/监听器/`agent.create` 断言并通过。**Diagnostics 导出（34）**：Settings → Export doctor text → detail-output 渲染完整报告（2355 chars，daemon/provider/terminal 分组）；脱敏复核：无 `123456`/`browser-live-token`/DevEcoStudioProject 绝对路径/`.ngf-agent-bridge` home 路径——R102 脱敏在 Web 消费路径真实生效。详见 `docs/agent-bridge-r174-webui-new-agent-diagnostics-progress.md`。

> 2026-08-16 R173 证据：Browser CDP host 重连 nonce 缺陷修复（App R161 同类）。缺陷：`browser-cdp-host.js` 只生成一次 appNonce，`RawWebSocketClient({reconnect:true})` 内置重连复用同一 URL（同一 nonce），Bridge 重启后每次重试被 `nonce_replay` 409 拒绝（10 分钟 TTL，实测连续拒绝）。修复（备份 `.bak-r173`）：自管理重连——`reconnect:false` + `connectBridge()` 每次构建全新 URL（新 appNonce）、close 触发指数退避重连（250ms 起上限 10s）、stop() 清理定时器、重连定时器不 unref（首轮修复后实测 unref 致事件循环空转退出已修正）、重连成功重新 `register()`。现场验证：kill Bridge → host 退避重试（进程存活）→ 重启 Bridge → host 0.3s 内以新 nonce 重连并重新注册、0 次 nonce_replay、host.list 恢复。新增 `check:r173`（Bridge A→注册→kill→同端口 Bridge B→20s 内重新注册断言）接入 postcheck 且单独退出码 0。附注：Bridge 心跳 45s idle+15s ping，健康客户端不误断；CDP host 与 Web UI 标签同时断连（idleMs≈50.7s）与 headless Chrome 后台节流相关。详见 `docs/agent-bridge-r173-cdp-host-reconnect-nonce-fix-progress.md`。

> 2026-08-16 R172 证据：`message.send` legacy `message` 别名文本丢失缺陷修复 + Web UI composer 长流现场。缺陷：`message.send` 带 `message` 字段时文本被静默丢弃（mock 回复 `(empty message)`、session user 消息 text 空），根因是 MESSAGE_SEND 处理器未像 `agent.run` 那样归一化 `message`→`text`（App/Web UI/CLI 均发 `text` 不受影响，直接以 `message` 调 RPC 的客户端受影响，与 `agent.run` 别名语义不一致）。修复（`agent-manager.js`，备份 `.bak-r172`）：`providerPayloadForAgent` 与 `providerMessagePayloadForSession`（含 record 缺失分支）统一 `text = readString(text, message)`，覆盖 agent.run/agent.send/message.send/message.queue.retry 全路径。修复后 `message:` 字段 user 文本完整落库 + assistant 回显原文，`text:` 字段回归正常；新增 `check:r172`（legacy/canonical/queue 三路径文本落库断言）接入 postcheck 且单独退出码 0。**Web UI composer 长流（第 23B 项）**：真实 Chrome 登录→选择 agent→composer 连续多条消息，user 文本 + assistant 回显在 Bridge session.messages 完整落库（4 条 composer 消息真实文本到达；1 条因重渲染后 ref 移位未达，换新 ref 复跑 2/2）。自动化注意点：agent 列表在视口上方时 CDP click 需先 scrollIntoView（非产品缺陷）。详见 `docs/agent-bridge-r172-message-text-alias-fix-progress.md`。

> 2026-08-16 R170 证据：Web UI 真实多标签现场验证（第 23B 项）。真实 Chrome（CDP 9224，经 chrome-cdp-field host）打开两个 Web UI 标签并同时登录（fill URL/token + click Connect 均经 preview→confirm，applied=True），两个标签各自渲染完整工作台（Connected + Host + Agents/New + workspace Mock）；6s 后复检仍 Connected。Bridge 侧两个独立 web 客户端连接（activeConnections 3→4），连接后 `session.messages.loaded` 计数 0 —— R165 风暴修复在多标签下保持；遗留标签对已消失 session 的周期单次查询由 R168 冷却 1-2ms 快速失败。附注：Chromium AX 树惰性计算（新页面前几次 snapshot 只返回 generic none 节点，浏览器行为非缺陷）。测试双标签已关闭。详见 `docs/agent-bridge-r170-webui-multitab-field-progress.md`。

> 2026-08-16 R169 证据：R168 冷却修复后整体健康复验 + usage 生产链 + Web 工作台会话闭环（HTTP RPC 直连 + Web UI 消费）。Web UI 页面仍打开（activeConnections=2）时全部 RPC 快速返回：daemon.status 87ms、daemon.instance.status 46ms（status=running/instanceHealth=healthy/workerReady=true/pid=52200/crashLoop=false）、usage.summary.get 42ms、usage.events.list 42ms、provider.usage.list 25ms —— 修复前 daemon.instance.status 曾超时 15s。第 22 项 usage 生产链：`usage.summary.get` eventCount=9（actual 聚合 USD 0.45、estimated、quota 90/100、compactions=3），`usage.events.list` 5 条明细含 R169 会话 actual 事件（input=10/output=5, source=mock-provider），`provider.usage.list`(mock) fail-closed `capability_unavailable`。第 23B 项 Web 工作台会话闭环：`session.create`(mock)→`ses_2ec7c13c28cd8caf`+`agt_tZF7s_bvazCSmsUL`→`message.send`→assistant 回复 `Mock provider received: (empty message) / Bridge protocol is ready.`→`session.messages` messageCount=2 完整链；Web UI Refresh 后 Agents 5→6 新增 R169 agent（agent.list 确认 provider=mock/workspaceId=wks_zaj5-VK2zd3LSfbb/ownershipStatus=valid）。设备仍深度锁屏（aa start 10106102），App 面板现场继续等待用户指纹解锁。详见 `docs/agent-bridge-r169-fleet-usage-web-workbench-progress.md`。

> 2026-08-16 R168 证据：Web UI Settings 面板 + missing-session discovery 冷却修复。真实 Chrome 中 Settings dialog 完整渲染（Refresh interval spinbutton、Export doctor JSON/text、Sign out、Close、HttpOnly session 提示）；composer 消息发送渲染。**缺陷修复**：`ProviderRegistry` 新增 `missingSessionCooldown`（30s），`findSessionAfterDiscovery` 对已确认不存在的 session 冷却期内直接返回 null，不再重复触发昂贵 provider discovery（codex exec 枚举 15-30s 拖慢事件循环致 health 间歇超时）；mock 不存在 session 3 次查询全部 1-2ms 快速失败（修复前每次触发 discovery），recorded-session/metadata-scope/provider-usage smoke 全部退出码 0。codex exec 慢属环境限制留 FIELD。详见 `docs/agent-bridge-r168-settings-discovery-cooldown-progress.md`。

> 2026-08-16 R167 证据：Browser 下载链路 + 公开 DTO 脱敏 + 全量回归。真实 Chrome 测试服务器目录页渲染、click 下载链接 applied=true、`browser.download.list` 结构化返回（tracking=cdp-events）；`browser.permission.get` 返回 `downloadDirectory: ".agent-bridge-downloads"` marker 且全文无绝对路径（R69/R71 脱敏生效）；设备数据库确认 provider=mock/mock-fast/endpoint 已持久化。R165 修复后 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0、0 失败行。详见 `docs/agent-bridge-r167-download-redaction-regression-progress.md`。

> 2026-08-16 R166 证据：Web 工作台完整交互 + Voice capability 门禁验证。真实 Chrome 中 Web UI 登录后工作台完整渲染（Host 0.1.4·srv_je-yNHB204xxnUNs + compatibility、Agents 5 mock + New、Workspaces Coder active + Open/Archive、composer）；**type 消息 → click Send → 消息渲染到会话**（composer→message.send→渲染闭环）。Voice（第 21/33 项）WebSocket+HTTP 双通道：`voice.status` 1ms 返回 8 项 capability fail-closed + streamingUpload + privacy/limits 完整；`voice.tts.speak`/`voice.session.start` 1ms 返回 `capability_unavailable` + HTTPS URL remediation（R14/R90 语义）；HTTP /rpc 10-50ms 正常。真机音频路由仍需设备解锁后验证。详见 `docs/agent-bridge-r166-webui-voice-field-progress.md`。

> 2026-08-16 R165 证据：Web UI session.messages 反馈循环缺陷修复（第 23B 项）。缺陷：Bridge 对 `session.messages` 查询响应后广播 SESSION_MESSAGES 事件（server.js 5739-5740），Web UI 收到事件又触发 refreshSession（app.js 1044）→ 事件→查询→事件循环，导致 Bridge 每秒处理几十条查询、health 8-15s 超时、设备反复断连。修复（`tools/agent-bridge/src/web/app.js`）：① `session.messages` 事件不再触发 refreshSession（响应已含完整消息列表）；② `refreshSession()` 增加 `sessionRefreshInFlight` 去重。验证：真实 Chrome 登录 Web UI 工作台（Connected + Host/Agents/Workspaces + mock session idle），修复后 `session.messages.loaded` 从每秒几十条降为 0、health 16ms、连接稳定；Web UI contract/live/multitab/session-experience/rich-content smoke 全部退出码 0。同期验证：usage.updated 事件实时推送（同 WS 6 条/消息，host 隔离，R9 语义）；MCP 工具目录 150+ 含 usage/metadata/diagnostics；CLI `metadata sessionTitle` 生产链 + `provider usage` fail-closed + `metadata_scope_mismatch` scope 校验。详见 `docs/agent-bridge-r165-webui-feedback-loop-fix-progress.md`。

> 2026-08-16 R163 证据：真实 Chrome 全 action 矩阵 + Codex 配置缺陷修复。托管本地测试页（127.0.0.1:9333），经真实 Chrome 151 headless CDP（9224）通过 Bridge 完成 **fill/type/click/hover/keypress/select/scroll/drag/evaluate 全 action 执行并 DOM 双向验证**（fill→click Submit→result='submitted:R163 Field User'；type→email='field@test.com'；select→'selected@test.com'；scroll→scrollY=1796；drag steps=8；所有写类 action 走 preview→planId→confirm 门禁）—— 第 16/23D 项 action 能力真实浏览器端到端证据。Web UI 工作台真实 Chrome 渲染登录界面（146 节点 AX 树，fill token + Connect 执行成功）。**现场缺陷修复**：`C:\Users\13359\.codex\config.toml` 与 `agents\luna-worker.toml` 的 `model_reasoning_effort = "max"` 无效（合法值 none/minimal/low/medium/high/xhigh），导致 Codex App Server 不监听 1945、Bridge 设备请求每次等 30 秒超时（health 8-15s）—— 已修复为 `high`（备份 .bak-r163）；Bridge 可 `AGENT_BRIDGE_CODEX_RUNTIME=exec` 切换（已验证）。设备端 host profile provider 已改 mock 并推送，设备锁屏待解锁验证。详见 `docs/agent-bridge-r163-browser-actions-codex-fix-progress.md`。

> 2026-08-16 R162 证据：supervisor 模式 Fleet + usage/metadata 生产链 + Web 认证链现场验证。Bridge 切 supervisor 模式后 `daemon.instance.status` 返回完整 supervisor 字段（`supervised=true, supervisorPid=19872, workerPid=38656, generation=1, workerGeneration=1, instanceHealth=healthy, restartCount=0`，对比直连模式 supervised=false/generation=0），设备自动重连成功（activeConnections=1，nonce 修复再次验证）。`AGENT_BRIDGE_MOCK_USAGE_EVENTS=1` 下 mock provider 真实事件生产链：`usage.summary.get` 聚合 actual(15 tokens/$0.15 USD)/estimated(20)/quota(90/100/resetAt)/compaction(200→80)；`usage.events.list` 3 条明细；`metadata.generate`(sessionTitle) 返回 suggestion+alternative+estimatedUsage+planId（scope 校验对 legacy 客户端仍生效）；`diagnostics.export` 8 组 report 且全文无 token/绝对路径（R102 脱敏）；Web 认证链 `web/auth/session`→ticket→原始 WS 握手 `101 Switching Protocols`→bridge.connected+serverInfo 全通（R13/R124 产物），Web 静态资源全部 200。详见 `docs/agent-bridge-r162-supervisor-usage-metadata-web-field-progress.md`。

> 2026-08-16 R161 证据：App 自动重连 nonce 修复 + 设备/真实浏览器现场验证。修复 `AgentBridgeClient.scheduleReconnect()` 复用旧 appNonce 被 Bridge 防重放（nonce_replay, TTL 10 分钟）拦截的缺陷：新增 `setAppNonceRefresher()`，重连前非 relay 模式刷新 nonce 并同步页面层 `bridgeConnectionAppNonce`（`bindBridgeHandlersForEpoch` 注册、`clearHandlers` 清理）。SDK 23 HAP 构建退出码 0（14,567,353 bytes，SHA-256 `4F14175E8F28AE94B7A4906E3F43DEC35AA5E4F78CFD0E3E4E29707A6BDAFF49`），`hdc install` 成功；设备 192.168.5.124 现场回归：kill Bridge 触发自动重连后 **3 秒内重连成功、全程无 nonce_replay**（修复前必被拦 10 分钟），后续自然断线同样 3 秒恢复。同期现场验证：`provider.usage.list`(codex)=`capability_unavailable` fail-closed；`metadata.generate` scope warnings（`agent_scope_unavailable_legacy_session`/`host_scope_unverified_legacy_client`）；`daemon.status`/instance.status 完整 Fleet 数据链；`voice.status` 能力矩阵 fail-closed + 设备 MICROPHONE 权限已声明；**真实 Chrome 151 headless CDP（127.0.0.1:9224）经 `BrowserCdpHost` 注册为 Bridge host（`chrome-cdp-field/ready/cdp`）完成 page.create→snapshot(15 节点)→permission preview/confirm→click preview/confirm applied→navigate→screenshot 全链**（第 16/23D 项首次真实浏览器现场，截图 r161-real-chrome-shot.png）。详见 `docs/agent-bridge-r161-app-reconnect-nonce-field-progress.md`。

> 2026-08-15 R160 证据：App 端补齐 GitHub OAuth 登出入口：`AgentBridgeClient.logoutGitHub()` 发送 `github.auth.logout`，页面新增 Sign out 按钮（已授权时启用）并在登出时清理全部本地 GitHub 状态与草稿；i18n 资源三份落盘；`AgentBridgeM7Parser.test.ets` 新增 logout 解析断言。SDK 23 HAP（14,547,897 bytes，SHA-256 `9479614D06ECEE66392D91736A22DF3E5174B9F9A84CD2EFB5D1F8AB0DB05A30`）、i18n JSON UTF-8 解析与 `git diff --check` 本轮通过；未安装、启动或测试设备。R160 只收口第 9 项 GitHub 集成的 App 登出源码缺口，真实 GitHub 账号 token 撤销、多账号、限流和现场多 Bridge 行为仍待 FIELD。详见 `docs/agent-bridge-r160-app-github-signout-progress.md`。

> 2026-08-15 R159 证据：Web 工作台 Browser 区新增 `browser.permission.get` 状态消费与 `browser-permission-status` 展示区（allowlist 域、受管下载目录状态、更新时间），与 App 端 R69 展示对齐；`refreshBrowserPermission` 绑定 `refreshBrowser` 的 refreshIsCurrent（refreshToken + connectionGeneration + socket OPEN + pageClosing + workspace）防迟到结果覆盖，旧 Bridge 缺 RPC 或失败时静默降级；`check-web-ui-contract-smoke.js` 新增 `browser.permission.get` 消费与状态区断言。`check:r13/r88/r116` 与 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 本轮退出码 0，`git diff --check` 退出码 0；未修改 ArkTS/HAP，未安装、启动或测试设备。R159 只收口第 23B、23D 的 Web permission 状态可见源码子阶段，真实 platform host、恶意页面/登录态、多标签长流、真实上传下载和 HarmonyOS App 全量动作仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r159-web-browser-permission-state-progress.md`。

> 2026-08-15 R157 证据：App 端 `supportsMetadataGeneration()` 与 `supportsUsageEvents()` 对齐 known 标志语义：`AgentBridgeProviderOption` 新增 `metadataGenerationCapabilityKnown`（parser 按 capabilities 键出现填充），新 Bridge 按显式 capability fail-closed，旧 Bridge 缺字段保留全局 feature 兼容；`AgentBridgeM5Parser.test.ets` 增加断言；SDK 23 HAP（14,545,893 bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`）和 `git diff --check` 本轮通过，未安装、启动或测试设备。R157 只收口第 22、34 项的 metadata capability 门禁一致性源码子阶段，真实 Provider metadata、长会话、quota/账单和真机展示仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r157-provider-metadata-capability-gate-progress.md`。

> 2026-08-15 R156 证据：Fleet 面板可见性改为只依据 App 本地 fleet orchestration 能力与已保存 host profiles（新增 `AgentHomeDaemonFleetAvailabilityPolicy`），不再读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；Fleet 面板从 daemon 诊断区移出为独立设置 stage，当前活动主机旧版或离线时其他已保存 host 仍可查询展示；每个目标仍由自身 `fleetTargetSupported/rollingEligible` 门控写操作，collect 结果写入前新增 hostProfileId 集合一致性校验并保留 host epoch 检查；新增 Hypium policy 测试注册 `List.test.ets`。SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0（HAP 14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`），`git diff --check` 退出码 0，未安装、启动或测试设备。R156 只收口第 14 项的 App 面板可见性/结果归属源码子阶段，跨平台 daemon、自启重启、真实双 Bridge rolling、升级回滚和 HarmonyOS App Fleet 真机现场仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r156-fleet-app-local-availability-progress.md`。

> 2026-08-15 R155 证据：`VoicePlatformFacade` 压缩音频路径按 SDK 23 官方状态机启动 AVPlayer：createAVPlayer 后在 idle 注册 `stateChange`/`error` listener，再设置 `dataSrc`，等待 `initialized` 后 `prepare()`、`play()`，每个异步阶段以 generation + player 身份 + requestId 复核；新增 `NGFRemotePlayerInitializationGate`（10 秒超时、一次性 settle），release 对称注销 listener、reject gate 唤醒初始化等待者且不产生未处理 rejection、仅当前 release generation 才 deactivate AudioSession；正常 completed 与 PCM/raw drain 完成均清 `snapshot.ttsRequestId`（本轮修复 PCM 路径残留，使 App 播放协调器能 complete 并清除 TTS mode）。`check:r155` 已接入 `postcheck`，定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP（14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）和 `git diff --check` 本轮通过；未安装、启动或测试设备。R155 只收口第 21、33 项的压缩音频 AVPlayer 启动状态机与迟到回调隔离源码子阶段，真机音频路由、权限、蓝牙/耳机、来电、弱网和真实 Provider 仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r155-voice-avplayer-state-machine-progress.md`。

> 2026-08-11 R152 证据：Web Browser 控制面新增 `Full-page screenshot` checkbox，截图请求不再固定发送 `fullPage=false`，而是只在用户显式选择时发送 `true`；响应继续经过 PNG/JPEG/WebP、Base64、签名、大小以及 connection generation/host/page scope 校验，旧 Bridge 缺字段安全回落为 `false`。`check:r152` 已加入 `postcheck`，本轮已实际通过 `check:r152`、`check:r116`、`check:r13`、`check:r88`、`check:browser` 和带 `system-conpty` 的 Bridge 全量 `npm run check`，全量退出码为 0，Docker runtime 按 opt-in 规则跳过。R152 只收口第 16、23B、23D 的 Web 整页截图源码子阶段，不替代真实 platform host、恶意页面/登录态、上传下载、多标签、长流和浏览器现场，三项继续保持“部分实现”。详见 `docs/agent-bridge-r152-web-browser-full-page-screenshot-progress.md`。

> 2026-08-10 R151 证据：HarmonyOS Agent Home Browser 控制面补齐整页截图可见入口，新增 `browserScreenshotFullPage` 状态和本地化 Switch，截图 RPC 不再固定发送 `false`；Browser action surface 保留 click、fill、type、keypress、hover、select、drag、upload、scroll、download、evaluate 全部 11 类 action，敏感操作继续 Preview -> Confirm。`npm run check:r151`、`npm run check:browser`、资源/package JSON 解析、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 大小 `14,523,736` bytes，SHA-256 `71D6A09B39D3D5A0006810AA7EBE245A31EF2487DBE713F1FC2E77F26EBCAAB6`。R151 只收口第 16、23D 的 HarmonyOS App action surface 源码子阶段，不替代真实 platform Browser host、CDP 页面、恶意页面/登录态、上传下载和真机动作现场，条目继续保持“部分实现”。详见 `docs/agent-bridge-r151-browser-app-action-surface-progress.md`。

> 2026-08-10 R149 证据：Web `BroadcastChannel` 新增 `experience.changed`，使用完整 `hostProfileId + workspaceId + agentId + sessionId` scope；queue cancel/retry、usage budget save/clear 和 Provider usage refresh 成功后广播，接收标签仅刷新当前 Session Experience，不触发全量 workspace/Provider 扫描。`check:r149`、受影响的 `check:r65/r88/r13`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty' npm run check`、package JSON 解析和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、安装、启动或设备测试。R149 只收口第 22、34、23B 的 Web 多标签源码子阶段，真实双标签、旧 Bridge、长流、HarmonyOS App 和现场 Provider 数据仍待 FIELD，相关条目继续保持“部分实现”。详见 `docs/agent-bridge-r149-web-multitab-experience-progress.md`。

> 2026-08-10 R148 证据：Web Terminal V2 新增独立 stream state，解析 NGF2 `restoreSeq/snapshotSeq`；V2 订阅在权威 restore 到达前拒绝 output delta，重复/旧 restore 不覆盖当前输出，unsubscribe/断线/shutdown/手动 snapshot 维护 stream epoch，V1 文本帧保持兼容。`check:r148`、`check:r147`、`check:r65`、`check:r88`、`check:r13`、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未执行 SDK 构建、安装、启动或设备测试。R148 只收口第 23B 的 Web Terminal 源码子阶段，真实长 terminal、多标签、旧 Bridge、HarmonyOS App renderer 和现场性能仍待 FIELD，第 23B 与相关现场条目继续保持“部分实现”。详见 `docs/agent-bridge-r148-web-terminal-stream-progress.md`。

> 2026-08-10 R147 证据：Web Diff 按文件/行游标生成稳定 page key，重复页不会二次追加；缓存保存 next cursor、截断状态和原因，Details 区提供截断反馈与继续加载。`check:r147`、Node syntax、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、安装、启动或设备测试。R147 只收口第 23B、30 的 Web Diff 分页源码子阶段，真实大仓库、旧 Bridge、多标签、HarmonyOS App 和现场性能仍待 FIELD，条目状态不提前收口。详见 `docs/agent-bridge-r147-web-diff-pagination-progress.md`。

> 2026-08-10 R146 证据：Web Session Experience 新增 `session/day/month` 用量窗口选择；summary、events、budget 和 Provider usage 统一携带窗口，queue 保持独立，窗口切换清理旧结果并按当前 scope 重拉；旧 Bridge 缺字段或回显不同窗口时显示受控降级提示。`check:r146`、`check:r28`（live day/month）、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、安装、启动或设备测试。R146 只收口第 22、34、23B 的 Web usage window 源码子阶段，真实 Provider quota/账单、旧 Bridge、多标签、HarmonyOS App 和现场数据仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r146-web-usage-window-progress.md`。

> 2026-08-10 R145 证据：Web compatibility 显式识别 `richContentAst` capability；超过 64 个节点追加受限 `fallback(reason=node_limit)`，缺少 capability 时 Web renderer 回退原始 text。`check:r143`、`check:r145`、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装、启动或操作设备。R145 仅收口第 22、27、23B 的 Web AST capability/截断源码子阶段，真实旧 Bridge、多标签、长流、HarmonyOS App 和真机现场仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r145-web-rich-content-capability-progress.md`。

> 2026-08-10 R144 证据：Bridge metadata request state 新增一次性 Provider cleanup hook，取消、timeout 和 WebSocket 断开触发受控清理；Codex App Server 临时 metadata thread/turn 在 request id 绑定下执行 best-effort interrupt/archive 并清除本地 session/message/usage 状态，Mock Provider 具备可取消延迟。`check:r26`、`check:r27`、`check:r144`、Codex App Server provider smoke、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装、启动或操作设备。R144 仅收口第 22、34 的 metadata 生命周期源码子阶段，真实 Provider quota/账单、长会话网络恢复和 App/真机展示仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r144-provider-metadata-cleanup-progress.md`。

> 2026-08-10 R142 证据：Web metadata apply 已覆盖 sessionTitle、branchName、commitMessage、pullRequest 四类建议；branch/commit/PR 均复用既有 preview/confirm 或 dry-run/confirm 链，commit plan 绑定 staged paths、仓库 snapshot、消息摘要和 Git generation，旧客户端未携带 plan 字段时保持兼容。`check:r142`、`check:r88`、workspace Git plan/Git smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未构建、安装或操作设备。R142 只收口第 22、34、23B 的 metadata apply 源码子阶段，真实 Provider/GitHub 权限、旧 Bridge、多标签、长流、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r142-web-metadata-apply-progress.md`。

> 2026-08-10 R140 证据：消息级 fork history 在 child context 持久化前新增 URL userinfo 与敏感 query 脱敏，runtime-isolation smoke 实际通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。R140 只收口第 22、34 的 fork context 输入安全子阶段，真实 Provider 长会话、跨 workspace fork 和真机展示仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r140-fork-context-credential-redaction-progress.md`。

> 2026-08-10 R139 证据：`metadata-scope.js` 的 timeline/diff 摘要在进入 Provider turn 前新增 URL userinfo 与敏感 query 脱敏；`npm --prefix tools/agent-bridge run check:r139` 实际通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。R139 只收口第 22、34 的 metadata 输入安全子阶段，真实 Provider metadata、长会话、Git/GitHub 应用和真机展示仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r139-metadata-summary-credential-redaction-progress.md`。

> 2026-08-10 R138 证据：Provider usage 公共结果新增 URL userinfo 与敏感查询参数脱敏，`message`、`warnings`、`details` 等字段不会把 `https://user:password@host` 或 token query 带入 RPC/Usage store；`npm --prefix tools/agent-bridge run check:r138` 实际通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。R138 只收口第 22、34 的 Provider usage 安全子阶段，真实 Provider quota/账单、长会话 compaction、metadata 和真机展示仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r138-provider-usage-credential-redaction-progress.md`。

> 2026-08-10 R136 证据：Web compatibility 新增 Browser action target、target-state 和统一结果 parser；Web Preview/Confirm 只消费归一化结果，legacy host 的 `browser_target_snapshot_unavailable` 进入确认提示与完成状态，`browser_target_changed` 保留稳定 remediation，旧 Bridge 缺字段安全降级为 `unknown`。`npm --prefix tools/agent-bridge run check:r136`、Web UI contract/live/session smoke 和 `git diff --check` 本轮通过；`check:r136` 已接入 Bridge `postcheck`。本轮仅修改 Node/Web/smoke/package/doc，未修改 ArkTS/HAP，未安装、启动或测试设备。R136 只收口第 23B、23D 的 Web target-state 消费子阶段，真实浏览器多标签、平台 host、恶意页面/登录态、长流、上传下载和 HarmonyOS App 全量动作仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r136-web-browser-target-state-progress.md`。

> 2026-08-10 R135 证据：Bridge `browser.page.action` 对敏感动作在支持时先获取受限 `page.snapshot`，只在内存计算 `pageId + instanceId + snapshot` SHA-256 digest；plan 不保存页面正文，Confirm 重新获取并在 digest 变化时返回 `browser_target_changed`，不派发 action。platform/HarmonyOS host 缺少、失败或返回非法 snapshot 时 fail closed；旧 external/CDP/native/custom host 保留兼容 warning `browser_target_snapshot_unavailable`。manager smoke 新增页面状态变化、platform 缺 snapshot capability 和 legacy warning 断言；`npm --prefix tools/agent-bridge run check:r135`、Node syntax 和 `git diff --check` 本轮退出码 0。本轮仅修改 Node Bridge/smoke/package/doc，未修改 ArkTS/HAP，未安装、启动或测试设备。R135 只收口第 16、23D 的 Browser action target-state 源码子阶段，真实平台 host、恶意页面/登录态、上传下载、HarmonyOS App 全量动作和现场浏览器仍待验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r135-browser-action-target-state-progress.md`。

> 2026-08-10 R132 证据：Provider recorded-session smoke 新增断线/重连模型：创建新的 Codex Provider 实例后重新回放三条 compaction，事件数量与首次回放一致，稳定 eventId 列表完全一致，证明 producer 不依赖进程内递增序号。`node --check scripts/check-provider-recorded-session-smoke.js`、`npm run check:r131` 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP，未安装、启动或测试设备。R132 只增强第 22、34 的 Provider compaction 重连自动化证据，真实 Provider 长会话、quota、metadata 和现场 App 展示仍待验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r132-provider-compaction-reconnect-progress.md`。

> 2026-08-10 R131 证据：Codex App Server compaction producer 现在使用稳定 item/compaction id、turn id 或受限快照生成确定性 `eventId`，并以最多 4096 项的有界集合防止同一 compaction 在 notification/item 顺序变化、断线重放或重复通知时再次发布。`check:r131` 完整重放录制 compaction，断言事件数量为 3 且 eventId 列表在重放前后完全一致；package JSON 解析、`git diff --check` 和 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 均本轮退出码 0，Docker runtime 按 opt-in 规则 skipped。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该证据只收口第 22、34 的 Provider usage producer 幂等子阶段；真实 Provider quota、长会话 compaction、metadata 和现场 App Usage/Diagnostics 仍待验收，条目保持“部分实现”。详见 `docs/agent-bridge-r131-provider-compaction-idempotency-progress.md`。

> 2026-08-10 R130 证据：Bridge `VoiceManager` 为每个远程 STT finish 建立内部 request record/registry；cancel、owner detach、expire 和 shutdown 在清理 session 前先标记并中止请求，迟到 Provider 响应在 transcript 解析与 final 事件发布前按 session/request identity 丢弃。取消统一返回 `voice_cancelled`，不发布 `session.failed`，音频 buffer、request 和 session 状态在 `finally` 清理。`check:r130`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装设备。该证据只收口第 21、33 的 Bridge STT 生命周期安全子阶段，真实 Provider、弱网、权限、蓝牙/来电和真机音频路由仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r130-voice-stt-cancellation-progress.md`。

> 2026-08-10 R129 证据：Bridge Browser host 生命周期新增内部 registration generation。成功重注册同一连接/hostId 前，旧 pending command 统一返回 `browser_host_reconfigured`；dispatch、结果处理和 page.action hostBinding digest 均校验当前代际，迟到结果不能覆盖新 capability。generation 不进入公共 App DTO，旧协议保持兼容。`node --check`、`check:r129`、Browser manager smoke、`npm run check:browser`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 本轮均通过；Docker runtime 按 opt-in 规则跳过。本轮未修改 ArkTS/HAP，未安装设备。该证据只收口第 16、23D 的 Browser host 生命周期安全子阶段，真实平台 adapter、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r129-browser-host-generation-progress.md`。

> 2026-08-10 R128 证据：Bridge Browser host 注册新增平台 `page.action` capability 必填门。显式 `hostKind=harmonyos`/`capabilitySource=platform` 且声明 `page.action` 的 host 缺少 `supportedActions` 时返回 `browser_host_action_capabilities_required`，显式空集合返回 `browser_host_capabilities_invalid`；external/CDP/native/custom host 保持旧 `supportedCommands` 兼容，单个未声明动作仍在执行前 fail closed。Node syntax、Browser manager smoke、`npm run check:browser`、Browser live smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则跳过。本轮未修改 ArkTS/HAP，未安装设备。该证据只收口第 16、23D 的 Browser 平台 action capability 源码子阶段，真实平台 adapter、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r128-browser-platform-action-capability-progress.md`。

> 2026-08-10 R127 证据：Agent Home 新增共享 Browser platform capability policy；显式 HarmonyOS/platform host 不再因 `connected=true` 或平台名称直接放行，必须同时通过 `browserHostCapabilityMetadata`、`browserPlatformHost`、`readiness=ready` 和 scope gate。external/CDP 旧 Bridge 保持 legacy connected 兼容。`check:r126`、`check:browser`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、Node syntax、SDK 23 HAP 构建与 `git diff --check` 本轮通过；HAP 大小 `14,513,974` bytes，SHA-256 `9D46569E313A4DCC701701792A5306F895BEC854D6CE9C7B4D59B45027476391`。构建中发现的 ArkTS `arkts-no-standalone-this` 已修复，本轮未执行设备操作。该证据只收口第 16、23D 的 App 平台 capability 子阶段，真实平台 adapter、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r127-browser-platform-capability-progress.md`。

> 2026-08-10 R126 证据：HarmonyOS Agent Home Browser 控制面新增 unsolicited `browser.updated` event scope gate；事件 parser 保留 lifecycle kind/host workspaceIds，页面不可见、workspace/host/instance/page 不匹配的事件 fail closed。workspace/host/session 切换统一清理 Browser 请求、列表、日志、下载和截图，运行期 workspace assignment 也经过同一 gate。`check:r126`、Node syntax、package JSON 解析和 `git diff --check` 本轮通过；本轮未执行 HAP 构建或设备操作。该证据只收口第 16、23D 的 App Browser state/lifecycle 源码子阶段，不替代真实平台 host、恶意页面、登录态、上传/下载和 HarmonyOS App 全量现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r126-browser-app-event-scope-progress.md`。

> 2026-08-10 R125 证据：Web Browser `refreshBrowser()` 现在为 hosts/instances/pages 串行结果绑定 refreshToken、connectionGeneration、workspaceId、socket 生命周期和当前 host；旧 workspace/host、断线重连或 capability 关闭产生的迟到结果会被丢弃并清空残留状态。`check:r125`、Node syntax 和 `git diff --check` 本轮通过；全量 Bridge check 将在文档更新后重跑。本轮未修改 ArkTS/HAP、未安装设备。该证据只收口第 23B/23D 的 Web Browser 刷新 scope 子阶段，不替代真实平台 host、恶意页面、登录态、上传/下载和 HarmonyOS App 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r125-web-browser-refresh-scope-progress.md`。

> 2026-08-10 R124 证据：Web UI 为 `pagehide` 释放的连接资源增加 `pageshow.persisted` bfcache 恢复路径；恢复时重新获取短期 WebSocket ticket、递增连接代际并复用当前标签的 scope，缺失 endpoint/内存会话或已注销时 fail-closed。`check:r124`、Node syntax 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP、未安装设备。该证据只收口第 23B 的 Web 页面生命周期源码子阶段，不替代真实多标签、旧 Bridge、长终端流、真实 Provider 和现场 Web/Browser host 验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r124-web-page-lifecycle-progress.md`。

> 2026-08-10 R123 证据：Agent Home rolling preview 现在通过 `cloneDaemonFleetSnapshot()` 复制完整 Fleet snapshot，保留目标 capability、rolling eligibility、warning 数量、heartbeat、版本和 isolate 状态，避免页面旧构造路径把 capability 默认回落为 true。Hypium 测试与 SDK 23 HAP 构建通过；本轮未安装设备。该证据只收口第 14 项 App preview 状态一致性子阶段，不替代跨平台 daemon、双 Bridge rolling 和 HarmonyOS App Fleet 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r123-fleet-preview-snapshot-progress.md`。

> 2026-08-10 R122 证据：Fleet 目标资格现在由目标自身的 `features.daemonFleetTarget` 明确授予；仅有 `instanceId`、缺少 capability 字段或明确为 `false` 的 Bridge 均只读展示，不进入 App rolling target，避免把实例身份误当成编排授权。新增 warning 数量归一化和 live smoke capability 断言；定向 smoke、SDK 23 HAP 构建和 `git diff --check` 本轮通过。该证据只收口第 14 项的 per-target capability fail-closed 子阶段，不替代 Windows/Linux/macOS 安装、自启重启、升级回滚、双 Bridge rolling 和 HarmonyOS App Fleet 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r122-fleet-capability-gate-progress.md`。

> 2026-08-10 R117 证据：Browser screenshot 公开边界新增 PNG/JPEG/WebP magic-byte 校验；`check:r117`、`check:r116`、`check:browser`、Node syntax 与 `git diff --check` 本轮通过。该证据只加强第 16、23D 的源码安全子阶段，不替代真实平台 host、恶意页面、登录态、上传/下载和 HarmonyOS App 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r117-web-browser-screenshot-integrity-progress.md`。

> 2026-08-10 R118 证据：Voice App TTS 初始化与播放回调新增 generation + hostProfileId + connectionEpoch gate；页面/host 生命周期和用户中断会使旧回调失效。SDK 23 HAP、Bridge 全量 check、Voice 纯逻辑测试和 `git diff --check` 本轮通过，HAP SHA-256 `6B719D681B063879AF7F6096D6FE98BA279426F57AE7453E8FDB68366FA3C2D3`。该证据只收口第 21、33 的 App 异步状态安全，不替代真机 AudioKit 路由、权限、蓝牙/来电、弱网和真实 Provider 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r118-voice-tts-generation-progress.md`。

> 2026-08-10 R119 证据：Browser action payload 在 Bridge 入口新增统一 fail-closed 校验；ref/sourceRef/targetRef、key、文本/值、evaluate 脚本、drag 坐标和 scroll delta 均有 UTF-8/范围/控制字符边界，旧 toX/toY drag 字段规范化兼容，upload 保持旧 optional-ref 语义。无效输入返回稳定 failureCategory，不创建 plan、不进入 confirm、不派发给 host。`check:r119`、Browser manager/live/CDP、protocol alignment 定向 smoke 与 Node syntax 本轮通过，`check:r119` 已接入 Bridge postcheck；本轮未修改 ArkTS/HAP、未构建或安装设备。该证据只收口第 16、23D 的 Bridge 参数边界，真实平台 host、HarmonyOS App 全量动作、恶意页面、登录态和上传/下载现场仍待验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r119-browser-action-input-boundary-progress.md`。

> 2026-08-10 R120 证据：Browser action validator 由原始 payload 复制改为按 action 的最小字段投影；workspace/agent/host/instance/page scope、ref/key、输入值、drag/scroll/evaluate 参数均显式归一化，URL、路径、headers、环境、非 action 脚本字段和未知字段不会进入 outbound host payload。drag steps 限制为 2–20 整数，scope 标识拒绝控制字符。独立 validator、manager outbound payload、Browser live/CDP、protocol alignment smoke、`check:r120` 和 `git diff --check` 本轮通过，`check:r120` 已接入 Bridge postcheck；本轮未修改 ArkTS/HAP、未构建或安装设备。该证据只收口第 16、23D 的 Bridge payload 安全边界，真实平台 host、HarmonyOS App 全量动作、恶意页面、登录态和上传/下载现场仍待验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r120-browser-action-payload-projection-progress.md`。

> 2026-08-10 R121 证据：Voice App 统一 active speech predicate，远程 TTS Provider 等待期间可通过现有停止入口取消；`AgentHomeVoicePlaybackCoordinator` 新增 `playbackStarted/complete`，NGF media snapshot 在远程资源清理完成后清除页面 TTS mode，host quiesce、失败、停止和旧 generation 继续 fail closed。Hypium 纯逻辑测试、`check:r121`、Voice contract/manager/event/protocol smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；SDK 23 HAP 构建退出码 0，`entry-default-signed.hap` 14,492,702 bytes，SHA-256 `3828FFC55FE364A4B1575AFD1744F6E753A9702FC37693D15F14FEE21F7987FC`。本轮未安装、启动或测试设备。该证据只收口第 21、33 的 App 请求/播放状态子阶段，不替代真机权限/音频路由、蓝牙/来电、弱网和真实 Provider 现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r121-voice-tts-lifecycle-progress.md`。

> 2026-08-10 R116 Web Browser screenshot preview：Web Browser Automation 已补齐截图可见闭环；Bridge 和 Web parser 只接受 PNG/JPEG/WebP，线性校验 Base64，限制 8 MiB 编码/6 MiB 解码载荷，预览使用受控 data URL，host/page 切换、断线和页面生命周期清理旧截图。`check:r116`、`check:browser`、`check:r88`、`check:web-live`、`check:r13`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则跳过。未修改 ArkTS/HAP，未安装、启动或测试设备；真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍为第 16、23D 现场门。

> 2026-08-10 R115 Web Provider usage details：Web Session Experience 新增 `provider.usage.list` 直读、Provider 套餐/窗口/details 面板和 `providerUsage` 双 capability gate；`check:r88`、Web live、Browser 回归、Node syntax 和 `git diff --check` 本轮通过。只修改 Node/Web UI 与 smoke，未构建或安装 HAP；真实 Provider、长会话、旧 Bridge 多标签和 HarmonyOS App/Web 现场仍待验收，第 22、34、23B 保持“部分实现”。详见 `docs/agent-bridge-r115-web-provider-usage-progress.md`。

> 2026-08-10 R114 Provider usage details App 闭环：Agent Home Provider Usage 区现在展示 parser 解析的可选套餐/账户 details，空 label/key 安全降级为 unavailable；`AgentBridgeM5Parser.test.ets` 覆盖 key、label、value，i18n 资源已补齐。`check:r87`、`check:r88`、`check:r104`、Bridge 全量 check、资源校验、`git diff --check` 和 SDK 23 HAP 构建本轮通过，HAP SHA-256 `9FB8DE1EE659964E2B3BE74A10065669AB443C5EA787C19D17B88C6E1CD36982`。真实 Provider quota/账单、长会话和真机 Usage/Diagnostics 仍待现场验收，第 22、34 项继续保持“部分实现”。详见 `docs/agent-bridge-r114-provider-usage-details-progress.md`。

> 2026-08-10 R110 Daemon Fleet 双 Bridge live smoke：新增 `check-daemon-fleet-live-smoke.js`，启动两个独立 supervisor Bridge，通过真实 WebSocket host scope 验证 A/B `instanceId` 隔离与重连稳定、supervisor replacement 后 generation 单调增长、A → B → A 切换，以及跨 host、旧 generation、跨实例 target guard 拒绝；`npm run check:daemon-fleet-live` 与包含新 postcheck 的 Bridge 全量 `npm run check` 均退出码 0。第 14 项仍保持“部分实现”，Windows/Linux/macOS 全局安装、自启、真实双 Bridge rolling 和 HarmonyOS App Fleet 现场继续作为现场验收。

> 2026-08-10 R108 Browser platform adapter fail-closed boundary：平台 Browser host 适配器的 `isAvailable()` 探测异常现在统一返回 `browser_platform_host_unavailable`，不会穿透 RPC 或错误开启 capability；Browser manager smoke、`check:browser`、Bridge 全量 check 与 `git diff --check` 本轮通过，未修改 ArkTS/HAP、未安装设备。真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收，第 16、23D 继续保持“部分实现”。详见 `docs/agent-bridge-r108-browser-platform-adapter-fail-closed-progress.md`。

> 2026-08-10 R109 Voice PCM/raw buffer cleanup：`VoicePlatformFacade` 远程 PCM/raw 播放将 renderer 写入与 `drain()` 放入 `try/finally`，成功和异常路径均清零 renderer 复制缓冲与局部 `decoded`；Voice contract smoke 增加 drain 后顺序断言。`npm run check:voice-platform`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 14,457,721 bytes，SHA-256 `86143C940328ACD75FE717FC7B4500E735C7271B18FA7E9E5A498E256CE4D490`。未安装、启动或测试设备；真实 Provider 与真机音频现场仍待验收，第 21、33 继续保持“部分实现”。详见 `docs/agent-bridge-r109-voice-buffer-cleanup-progress.md`。

> 2026-08-10 R107 Fleet rolling interrupted-state persistence：App Fleet rolling 运行记录新增版本化 settings 持久化；App 重启读取旧 `running` 记录时归一化为 `interrupted/app_restarted`，恢复 completed/failed/pending/excluded 明细但不自动继续，损坏记录安全降级。新增 Hypium codec 测试；SDK 23 HAP 构建与 `git diff --check` 本轮通过，未安装设备。真实 App 重启、跨平台 daemon、自启升级回滚和双 Bridge rolling 仍待现场验收，第 14 项继续保持“部分实现”。详见 `docs/agent-bridge-r107-fleet-interrupted-state-progress.md`。

> 2026-08-10 R104 Provider usage stale snapshot：`ProviderUsageService` 新增按 provider/host/session/agent/window 隔离的有上限 TTL 内存快照；同 scope 刷新失败时保留最后一次成功快照并标记 `stale`，不生成新的 quota event，TTL 到期或 scope 不匹配仍返回结构化失败。新增 freshness smoke 并接入 `check:r104`/Bridge `postcheck`；本轮未修改 ArkTS/HAP、未安装设备。真实 Provider quota/账单、长会话和真机 Usage/Diagnostics 仍待现场验收，第 22、34 项继续保持“部分实现”。详见 `docs/agent-bridge-r104-provider-usage-stale-snapshot-progress.md`。

> 2026-08-10 R105 Fleet cancellation result integrity：`AgentHomeDaemonStepExecutionResult` 现在保留 Bridge action 的 `failureCategory`，Fleet coordinator 将 host lifecycle/连接池停止产生的 `cancelled` 结果向上传播，不再误归类为普通 `failed`；当前步骤首错停止，后续实例保留 `pending`。新增 Hypium 纯逻辑测试覆盖取消状态；SDK 23 HAP、Bridge 全量 check 和 `git diff --check` 本轮通过，未安装设备。跨平台 daemon、自启/升级回滚和双 Bridge rolling 仍属于第 14 项现场验收。详见 `docs/agent-bridge-r105-fleet-cancellation-progress.md`。

> 2026-08-10 R106 Fleet lifecycle interruption guard：新增 `AgentHomeDaemonFleetRunControl`，页面销毁或 host 切换会取消当前 rolling run；coordinator 在步骤边界停止后续 executor，并返回 `status=interrupted`、`interruptionReason`、completed/pending 分组，不自动继续或把最后一步误报为 completed。新增 Hypium 测试覆盖步骤间取消和最后一步取消边界；SDK 23 HAP 构建和 `git diff --check` 本轮通过，未安装设备。跨平台 daemon、自启/升级回滚和双 Bridge rolling 仍属于第 14 项现场验收。详见 `docs/agent-bridge-r106-fleet-interruption-progress.md`。

> 2026-08-10 R103 Browser warning URL redaction：`BrowserAutomationManager.sanitizeCapabilityWarningText()` 现按所有 `scheme://` URL 执行协议感知过滤；HTTP/HTTPS/WS/WSS 只保留兼容 `[url]` marker，`file://`、`ssh://`、`ftp://` 等非支持协议也不再公开路径、authority、凭证或查询参数。manager/live/CDP/event scope 定向 smoke、`check:browser`、Bridge 全量 check 和 `git diff --check` 本轮通过。该阶段只加强第 16、23D 的 Browser 公共文本安全边界，真实 desktop/platform host、HarmonyOS App 全量动作、上传下载、恶意页面和登录态现场仍待验收，相关条目继续保持“部分实现”。详见 `docs/agent-bridge-r103-browser-warning-redaction-progress.md`。

> 2026-08-10 R102 Diagnostics URL/credential redaction：Bridge diagnostics export 的统一脱敏现在覆盖 HTTP/HTTPS、WS/WSS、`file://` URL、URL 内凭证、Bearer/Basic、access/refresh token、API key、client secret、authorization、cookie 和私钥路径；网络 URL 只公开无凭证 origin marker，文件 URL 使用稳定 marker。`check-diagnostics-smoke.js` 与 Agent Experience smoke 增加对应断言，定向检查、Bridge 全量 check 和 `git diff --check` 本轮通过。该阶段只加强第 22、34 项的诊断安全边界，真实 Provider、长会话 compaction、真机 Usage/Diagnostics 和跨平台安全存储仍待现场验收，相关条目继续保持“部分实现”。详见 `docs/agent-bridge-r102-diagnostics-redaction-progress.md`。

> 2026-08-10 R101 Browser live action capability contract：`check-browser-automation-live-smoke.js` 已按当前 Bridge 语义修正：host 未显式声明 `drag` 等 action 时，`BrowserAutomationManager` 在 preview 阶段返回 `browser_action_unavailable`，不创建 plan 或进入 confirm。实际执行 `npm run check:browser` 与 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 均通过；Docker runtime 按 opt-in 规则 skipped，`git diff --check` 无实际空白错误。本轮未修改 ArkTS/HAP、未安装设备；真实 desktop/platform host、HarmonyOS App 全量动作、上传下载、恶意页面、登录态和长流仍属于第 16、23D FIELD 验收，不能据此关闭条目。

> 2026-08-09 R100 Provider runtime descriptor gate：Provider descriptor 与顶层 feature 现在共用 `providerRuntimeEnabled()`，带 `runtimeConfigError` 或 `runtimePreference=exec` 的静态 usage/metadata 声明均被降级为 false；安全 HTTPS endpoint-only `providerUsage` 仍独立可用。blocked runtime 场景已加入 `check-provider-runtime-capability-smoke.js`，`npm run check:r78`、Node syntax 和定向 smoke 本轮通过。未修改 ArkTS/HAP，未连接、安装或操作设备。R100 只修正 capability 一致性，第 22、34 项仍因真实 Provider quota/账单、长会话 compaction、四类 metadata 和真机展示保持“部分实现”。

> 2026-08-09 R99 App Provider usage-events capability gate：App Provider model/parser 增加可选 `usageEventsCapabilityKnown`；新 Bridge 的 Usage 入口现在按当前 Provider 的显式 `capabilities.usageEvents` gate，缺少 producer 的 Provider 不再沿用全局 Usage event 入口，旧 Bridge 缺字段仍保留兼容行为。`AgentBridgeM5Parser.test.ets` 增加新/旧 descriptor 断言；本轮 `git diff --check` 无实际空白错误。未执行 ArkTS/HAP 构建或设备操作。R99 只收口 App capability gate，第 22、34 项仍因真实 Provider usage/quota、账单、长会话 compaction、四类 metadata 和真机展示保持“部分实现”。

> 2026-08-09 R98 Provider runtime capability gates：`ProviderRegistry.hasUsageEvents()` 与 `hasMetadataGeneration()` 将顶层 `serverInfo.features.usageEvents`/`metadataGeneration` 绑定到当前运行时；descriptor normalization 要求 metadata 方法与 capability 声明、usage producer marker，invalid Codex runtime 和 `exec` fallback 不再发布错误能力。新增 `check-provider-runtime-capability-smoke.js` 覆盖无能力、Mock 能力、invalid runtime 及 HTTPS/HTTP/嵌入凭证 endpoint；`check:r28`、`check:r76`、`check:r81`、`check:r87`、`check:r88`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 均通过。Docker runtime 按 opt-in 规则 skipped；本轮未修改 ArkTS/HAP，未连接、安装或操作设备。R98 只关闭静态 capability 误报，第 22、34 项仍因真实 Provider quota/账单、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 展示保持“部分实现”。

> 2026-08-09 R69 Browser permission state：Bridge `publicPermissionState()` 将 workspace/domain permission、下载目录受管状态和更新时间收敛为脱敏 DTO，permission preview/confirm/get 与 `browser.permission.updated` 共用该 DTO；App parser 兼容嵌套 permission、旧扁平字段和缺字段默认值，Browser 面板展示 allowlist、下载目录状态和更新时间，host/workspace 切换时清理旧状态。Browser manager smoke、protocol alignment smoke、Bridge 全量 `check`、SDK 23 HAP 构建和 `git diff --check` 均通过；HAP SHA-256 `10B28A1F2ABC9B5C0DFE8D4EAA0CC0E1230A2D4627C97A5E76ADFA0799BEFBB3`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；真实平台 host、上传下载、恶意页面和真机全量动作仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R70 Voice permission semantics：media contract 新增 `NGFVoicePermissionRemediation`，`VoicePlatformFacade` 在麦克风授权成功时清理 remediation/failure/message，拒绝时固定返回 `permission_denied` 与 `open_app_permission_settings`；Agent Home voice composer 使用共享常量并展示中英文 remediation 文案。Voice platform contract smoke、Bridge 全量 `check`、SDK 23 `assembleHap --no-daemon --stacktrace`、资源校验和 `git diff --check` 均通过；HAP SHA-256 `34D84AFBC3B17E6AB70F9BEFFED9D2663E9B9494E652AD2BB5E9161DF85A90C5`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；真机权限、音频路由、蓝牙/来电、弱网长录音和真实 Provider 仍待 FIELD，第 21、33 保持“部分实现”。

> 2026-08-09 R71 Browser download path public-boundary：修正 `browser.permission.get` 顶层兼容字段、Chromium CDP download action/list 和外部 Browser host result 的绝对工作区路径公开；兼容字段固定为 `.agent-bridge-downloads`，Bridge 内部命令仍使用受管目录绝对路径，公开结果清理 `downloadDirectory`、`downloadPath`、`filePath`、`path` 和 `filePaths`。Browser manager/CDP/live/protocol alignment smoke 与 Node 语法检查均通过；本阶段未修改 ArkTS/HAP、未安装设备。第 16、23D 的真实平台 host、上传下载、恶意页面、登录态和 HarmonyOS App 全量动作仍待 FIELD。

> 2026-08-09 R72 Browser download URL public-boundary：外部 Browser host 与 CDP `download.list` 的公开下载记录现在只保留无凭证 HTTP(S) URL；`user:password@host`、控制字符、非 HTTP(S) 或超长 URL 会从公开 DTO 移除，Bridge 发往受控 host 的内部 URL/路径不变。manager/CDP/live/protocol 定向 smoke、Node 语法检查、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 与 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装设备。第 16、23D 的真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD。

> 2026-08-09 R73 Daemon public-surface：`daemon.status`、`daemon.health` 和 `daemon.logs` 的公开 DTO 不再返回 Bridge home、配置/日志绝对路径或 managed process 的 command/args/cwd/完整 identity；兼容字段固定返回 `.agent-bridge/config.json` 与 `.agent-bridge/logs/daemon.log` marker，进程记录只保留受控 owner 摘要和生命周期元数据。新增 public-surface live smoke 覆盖预置私有路径记录、三类 RPC 和路径泄露断言；Node 语法检查与定向 smoke 通过。本阶段未修改 ArkTS/HAP、未安装设备；第 14、16 的跨平台/现场安全门保持不变。

> 2026-08-09 R74 Daemon update public-surface：daemon `status`/`health` 的嵌套 `update` 和独立 `daemon.update.status` 现在共用 `publicDaemonUpdateStatus()` allowlist，移除 saved update state 中的绝对路径、command/args/cwd、环境和凭证字段，state/staged/backup/development root 只返回固定 marker。public-surface smoke 预置私有 update state 并验证无临时 Bridge home 泄露；Node 语法检查、public-surface smoke、daemon supervisor live smoke 通过。本阶段未修改 ArkTS/HAP、未安装设备。

> 2026-08-09 R75 Bridge check-chain：新增 `check:r75`，将远程配置 `check:r32`、Docker contract smoke 和 Docker runtime smoke 接入 `postcheck`，因此 `npm run check` 会实际执行这组验证。定向 R75 与 Bridge 全量 `npm run check` 退出码 0；Docker runtime 默认受控 skip，需显式设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 才构建/运行容器，本轮未将重型 runtime 构建记为通过；`git diff --check` 通过。本阶段未修改 ArkTS/HAP，未安装、启动或测试设备。第 14 项跨平台 daemon/rolling、第 23B/23D 真实现场边界保持不变。

> 2026-08-09 R77 App compatibility build metadata integrity：连接模型、hello、Push 注册和会话子窗口移除 `1.0.0` 运行时兜底；主窗口与会话窗口只使用 `bundleManager.getBundleInfoForSelf().versionName`，缺失时向 Bridge 传空值并由 compatibility builder 返回 `unknown`/非 blocking。新增 `check-app-compatibility-build-metadata-smoke.js` 与 `check:r77`，本轮定向 smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP `assembleHap --no-daemon --stacktrace` 均退出码 0；HAP SHA-256 `71C84A6231CBF43719D0A5CDF496DC3210DD18D4E02F7408F73AA4250D77248A`。本阶段未安装、启动或测试设备。真实版本矩阵、BundleInfo 异常和真机兼容卡展示仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R80 App usage budget currency integrity：Agent Home 预算编辑器在 Bridge 缺少真实币种时保持空值，不再回填 `USD`；预算 scope 切换、清除和重置同时清除旧币种，成本预算继续要求显式币种。新增 `check-app-usage-budget-currency-smoke.js`/`check:r80`，并扩展 `AgentBridgeM5Parser.test.ets` 的缺失币种断言；R80 定向 syntax/smoke 与 `git diff --check` 退出码 0。本轮未执行 HAP 构建或设备安装，真实 Provider 币种、quota、compaction、metadata 和真机展示仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R88 Web Session Experience：Web UI 新增 M5 Session Experience 区域，消费 `message.queue.*`、`usage.*` 和 `metadata.generate`；queue 支持取消/失败重试，Usage 展示 actual/estimated、token、费用、quota、budget、compaction 和事件明细，Metadata 支持四类 preview、编辑、复制、重新生成、Bridge cancel 与 session title 应用。体验刷新绑定 host/workspace/agent/session/provider scope，并在写入前校验连接代际，迟到结果不会污染新会话；旧 Bridge 缺 feature/字段时隐藏增强区。R88 定向 smoke、Web contract/live、multi-tab scope、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 与 `git diff --check` 本轮退出码均为 0；未修改 ArkTS/HAP，未安装设备。真实 Provider、旧 Bridge、双标签/长流和 HarmonyOS App 现场仍待验，第 22、34、23B 保持“部分实现”。

> 2026-08-09 R89 Provider Usage capability 聚合：修正 `ProviderUsageService.anyAvailable()` 仅检查 `getUsage()` 的缺口，现在全局 `providerUsage` feature 与 endpoint-only Provider 的实际 `isAvailable(providerId)` 一致；仅配置安全 HTTPS `usageEndpoint` 的 OpenCode/Gateway/profile Provider 不再被 App 错误隐藏，未配置、HTTP 或内嵌凭证 endpoint 仍保持关闭。Provider usage endpoint/runtime capability 定向 smoke、Node 语法检查和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未安装设备。真实 Provider quota/账单、长会话和真机 Usage/Diagnostics 仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R90 Voice capability matrix：Bridge 新增可选 `serverInfo.features.voiceCapabilityMatrix=true`，App 在新 Bridge 上独立消费 `voiceRemoteSpeechToText`/`voiceRemoteTextToSpeech`，只对缺少矩阵标识的旧 Bridge 回退 `features.voice` 汇总，修复 STT-only Provider 错误显示 TTS 的能力门问题。Voice parser、protocol alignment、Voice manager/platform smoke、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 均通过；HAP SHA-256 `502005B65E3F15F024A30EC08FFE47FCF4655CAF45EC0B5EF03363249924C070`。本轮未安装设备；真机权限/路由、蓝牙/来电、弱网长录音和真实 Provider 仍待 FIELD，第 21、33 保持“部分实现”。

> 2026-08-09 R91 Daemon Fleet App 聚合摘要：新增强类型 `AgentHomeDaemonFleetSummary` 与版本分布模型；Fleet 面板展示实例总数、健康状态聚合、Bridge/config 版本分布、告警实例数和缺失心跳数，并在实例行展示最近心跳。旧 Bridge/不可达实例仍只读计入摘要，不进入 rolling target；新增 Hypium 纯逻辑测试覆盖状态、版本、告警和心跳缺口。资源 JSON、Bridge 全量 `npm run check`、SDK 23 HAP 构建和 `git diff --check` 均通过；HAP SHA-256 `F6B929E21979DF4ECCDCB2B8CDB95E116005FF9F26BC96AB9661BB45F2EF52C1`。Windows/Linux/macOS、自启/升级回滚、双 Bridge rolling 和指定设备现场仍待验收，第 14 项保持“部分实现”。

> 2026-08-09 R92 Browser host warning 公共边界：`normalizeCapabilityWarnings()` 在 Browser host 注册入口对 URL、Windows/Unix 绝对路径、Bearer/token/password 等 credential 片段做稳定占位符脱敏，保留普通诊断文本和数量上限；manager smoke 增加敏感值不出现在公共 warning 的断言，Bridge 全量 check 的 Browser manager precheck 已覆盖该路径。未修改 `browserPlatformHost=false`，真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R94 Browser host result 递归脱敏：`BrowserAutomationManager.copyHostResult()` 对所有外部 host result 执行递归公开 DTO 过滤，嵌套 headers/cookies/token/password/private-key/cwd/args/env/path 等敏感键不再穿透；HTTP(S)/about:blank URL 移除凭证并删除敏感查询参数，其他 URL/协议不公开；深度、键数、数组条目和 UTF-8 文本受限。manager smoke 新增 page list 嵌套泄露断言；`npm run check:browser`、Browser CDP/live/protocol smoke、Bridge 全量 `npm run check` 和 `git diff --check` 本轮通过。未修改 ArkTS/HAP，未安装设备；受支持平台 host、真实上传下载、恶意页面、登录态、HarmonyOS App 全量动作、多标签和长流仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R95 Browser 平台 Host 适配器边界：新增 `browser-platform-host.js` 适配器契约；`harmonyos` 或 `capabilitySource=platform` 的 host 注册必须通过适配器可用性和注册校验，默认 Bridge 使用不可用适配器并返回稳定 `browser_platform_host_unavailable`，不把客户端自报 metadata 当成平台实现。`serverInfo.features.browserPlatformHost` 改为由适配器可用性派生，公开 host DTO 增加可选 `platformHost` 标识；默认拒绝与注入测试适配器后的受控注册由 Browser manager/protocol smoke 覆盖，`check:browser` 已纳入新模块语法检查。本轮未修改 ArkTS/HAP、未安装设备；真实 HarmonyOS/受支持平台 adapter、App 全量动作、上传下载、恶意页面、多标签和长流仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R96 Voice 远程 PCM/raw 采样深度：`sampleBits` 从 Bridge Voice 结果经 Agent Home 传入 NGF media contract；缺省保持 16 位，媒体层校验 8/16/24/32 位并映射 SDK 23 `AudioSampleFormat`，不再固定按 S16LE 播放。Voice parser/contract smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP SHA-256 `9533179E1523A8C2B7F1119E2350BF7D63A34401828B018C2C707EBC45A0E275`。未连接、安装或操作设备；真实 Provider profile、真机音频路由和蓝牙/来电仍由第 21、33 FIELD 管理。

> 2026-08-09 R97 Encrypted settings secure master key：`EncryptedSettingsStoreFacade` 移除固定静态主密钥和普通 AppStorage 持久化，改用已有 `ngfKeyStoreManagerFacade`/AssetStoreKit 保存稳定 alias；旧 AppStorage 主密钥仅在安全存储可用时一次性迁移并清空，安全存储不可用时返回 `secure_storage_unavailable`、读写 fail closed。新增 `check-encrypted-settings-store-smoke.js` 并接入 Bridge `postcheck`；定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 14,429,593 bytes，SHA-256 `AD93C3589F9EAA294A34B3369C196E3C379D772A0BCD206EF78CF5639FF890CD`。未连接、安装或操作设备；跨平台安全存储和真机迁移仍需现场验证，第 16 项保持“部分实现”。

## 1. 核查口径

本清单以当前工作区源码为准，核查范围包括：

- HarmonyOS App：`entry/src/main/ets/features/agentBridge/`、`entry/src/main/ets/features/agentHome/`、`entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`、相关测试与资源。
- Bridge：`tools/agent-bridge/src/`、`tools/agent-bridge/scripts/`、`tools/agent-bridge/package.json`。
- Paseo 参考实现：`paseo/docs/`、`paseo/public-docs/`、`paseo/packages/server/`、`paseo/packages/app/`、`paseo/packages/cli/`。

本次核查不把协议常量、模型字段、关闭的 feature flag、目录名或历史测试记录单独视为“已实现”。一项能力至少要具备可调用处理链；涉及 App 的条目还要存在 App 调用或展示入口。

实现状态与验证状态分开记录：

- `已实现`：标题范围内的主要协议、Bridge 处理、持久化/运行时和 App 接线已形成闭环。
- `部分实现`：已有可运行子能力，但标题范围仍有明确功能缺口。
- `未实现`：当前只有声明、占位、Paseo 参考实现，或完全没有本项目处理链。
- `自动验证已覆盖`：当前仓库存在对应 smoke/单元测试；不等同于本次重新执行通过。
- `待现场验证`：实现依赖真机、AGC、真实远端服务、长期运行或多主机环境。
- `未验证`：只有静态源码证据，尚未找到针对性自动或现场验证证据。

> 2026-07-14 M5 收口已实际执行 Agent Experience、runtime isolation、protocol alignment 定向 smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均通过；HAP 仅保留既有资源重名与 syscap 警告。真实 Provider quota、真机键盘、平板/折叠屏连续缩放和 SubWindow 手势仍属于现场验收。

> 2026-07-14 M6 收口已实际执行 Relay crypto/server/manager、CLI/MCP/protocol 定向 smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均通过；HAP 仅保留既有 syscap 与 CryptoFramework 异常声明警告。真实公网 Relay、蜂窝网络切换和真机前后台恢复仍属于现场验收。

> 2026-07-15 M7 收口已实际执行 schedule/loop/chat room manager、management CLI live、MCP host/live、protocol alignment 定向 smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均通过；HAP 仅保留既有资源重名、syscap 与异常声明警告。DST 长期运行、多 Agent 房间交互和 daemon 重启现场观察继续作为补充验收。

> 2026-07-16 复核说明：Bridge 全量 `npm --prefix tools/agent-bridge run check` 已通过；另行执行 daemon remote config、Docker contract、Web UI contract/live 定向 smoke 也通过。Docker/Web/remote-config 当前位于 `preprecheck`，不会被 `npm run check` 自动执行；Docker daemon 本次不可用，runtime/buildx 仅保留历史证据。测试通过只证明已覆盖的契约，不替代对 App 可见闭环、敏感数据边界和真实 Provider/浏览器能力的源码核查。

> 2026-08-10 R113 Browser App workspace-file upload selection：Agent Home Browser action 面板新增 `AgentHomeBrowserUploadPolicy`，只允许从当前 workspace 已知文件列表选择普通文件并以相对路径进入 upload action；绝对路径、URI、`.`/`..`、空段、目录、失效条目和跨 workspace 条目均在 App 侧拒绝。新增 Hypium policy 测试并注册；`npm --prefix tools/agent-bridge run check:browser`、资源 JSON 校验、SDK 23 HAP `assembleHap --no-daemon --stacktrace` 与 `git diff --check` 本轮通过，HAP 14,481,212 bytes，SHA-256 `5931E5EE0B74A9E1E5552C81F67896736979192B452D508B5D45BCC27EB9F6F8`。第 16、23D 仍因真实平台 host、真实上传/下载、恶意页面、登录态和真机全量动作保持“部分实现”。

> 2026-08-08 R23 Voice capture lifecycle：`VoicePlatformFacade` 为每次 AudioCapturer 绑定 generation/capturer identity，迟到 readData 回调在 PCM 分帧前丢弃；AudioSessionManager deactivation listener 在 release 时成对注销。Voice platform contract smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP 构建通过；指定设备 `5KLBB25A10203862` 为 Offline，未安装、启动或测试。第 21、33 项的真机音频路由和真实 Provider 现场仍待验收。

> 2026-08-08 R24 Voice field validation：`VoiceManager` 对 MIME、采样率、声道、采样深度、语言、transcript 和 TTS audio profile 执行显式上限/allowlist 校验；Provider 异常统一映射为稳定脱敏文案，未知 TTS 格式不再回退为默认格式。Voice manager/platform smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP 构建均退出码 0；HAP SHA-256 `FCBCCACB88ECB9E50606D9E8FA424DBB7DBDACF6CF0DD496EA987D53F9C9EA08`。指定设备 `5KLBB25A10203862` 为 Offline，未安装、启动或测试；第 21、33 项的真机音频路由和真实 Provider 现场仍待验收。

> 2026-08-08 R25 Usage/Metadata result integrity：Provider quota 的负值、Infinity 和超出安全整数的数值保持 unavailable，不再被归一化成 0；metadata kind/result 统一执行白名单、UTF-8 长度、控制字符、去重和错误脱敏。Provider usage 与 metadata scope 定向 smoke、Bridge 全量 `npm run check`（含 R12/R13/Voice platform postcheck）均退出码 0；第 22、34 项的真实 Provider quota/compaction/metadata 与 App 现场仍待验收。

> 2026-08-08 R26 Metadata request integrity：Bridge 在 Provider turn 前建立 request state，timeout 使用受控 race；连接断开、显式 cancel、重复 request/cancel 和 host/session/agent scope 不匹配均不会让迟到结果回写。App parser、MCP cancel 工具、CLI 四类 metadata/timeout/cancel 和可控延迟 Mock Provider 已接线；R26 metadata request smoke 覆盖 timeout/cancel/duplicate/scope，Bridge 全量 `npm run check`（含 R12/R13/R26/R27/Voice platform postcheck）均退出码 0。SDK 23 HAP 构建退出码 0，SHA-256 `4D0C10F68CC4C2C164AD532B902B21EE7F6DE55CAA34E6C954A4B78D3CF2D753`；指定设备 `5KLBB25A10203862` 为 Offline，未安装、启动或测试；真实 Provider/真机现场仍待验收。

> 2026-08-08 R28 Usage/Metadata live lifecycle：Mock Provider 在显式测试开关下产生 actual/estimated/quota/compaction 事件，Bridge 对缺失 `agentId` 的 usage 事件从当前 session 的权威 Agent 补齐；真实 WebSocket live smoke 覆盖 message queue、budget warning、usage summary/events、四类 metadata、host 隔离和断线重连恢复。R28 定向 smoke 与 Bridge 全量 `npm --prefix tools/agent-bridge run check`（含 postcheck）均退出码 0；Mock 数据不作为真实套餐或真机证据，真实 Provider quota/compaction/metadata 与 App 现场仍待 FIELD。

> 2026-08-08 R7 Web Browser 控制面收口：Web 已接入 host 选择、instance list/create/close、page create/list/close、navigate/back/forward/reload、snapshot、screenshot、logs、wait、download list、permission 与全部 browser action；敏感动作和关闭操作复用 Bridge preview/confirm，host capability 不匹配时按钮隐藏，上传路径先做 workspace-relative 校验。`node --check src/web/app.js`、Web contract/live、Browser manager/CDP/live/protocol 与 Bridge 全量 `npm run check` 均退出码 0。23B/23D 仍因多标签/旧 Bridge/长流、HarmonyOS App 全量动作、受支持平台 host 和真实浏览器现场保持部分实现。

> 2026-08-08 R6-WEB-2 源码收口更新：Web Terminal 已接入 V2 subscribe/restore/output/input/resize 与 `bufferedAmount` 背压保护；Web workspace 文件区已接入 list/preview/一次性同源 download；Git Web 已接入 stage/unstage/commit/pull/push/branch/stash/merge/discard，并复用 R2 planId preview/confirm；Git/Diff 增加 summary/files/unified 视图和当前文件分页缓存。settings/doctor 已消费 `daemon.status`、`daemon.health`、`workspace.registry.doctor` 和 `diagnostics.export`，规范化八组诊断状态、兼容状态、脱敏 remediation 与受控 actionId，并提供 JSON/text 导出。Web contract/live smoke、diagnostics smoke 与 Bridge 全量 `npm run check` 本轮退出码 0；完整 GitHub 工作台、多标签、旧 Bridge/长流现场仍保留。

> 2026-08-08 R6-WEB-2 GitHub 工作台收口：Web 已消费现有 OAuth Device Flow、auth/account、workspace/repository binding、PR list/status/update、reviewer/label、merge、checks、watch 和 attachment preview/upload RPC；OAuth 只显示 user code 与 HTTPS verification URL，PR/绑定/附件写操作遵循 preview/confirm 和短期 plan，`githubAssetUpload` 关闭时隐藏上传入口。新增 `check-web-github-smoke.js` 覆盖环境 token、mock GitHub PR/checks/watch 和 capability 降级；Web contract/live、GitHub smoke 与 Bridge 全量 `npm run check` 本轮退出码 0。真实 GitHub 账号/组织权限/资产服务、多标签、旧 Bridge、长流和浏览器现场继续待验。

> 2026-08-08 R8 HarmonyOS App Browser 异步状态收口：`AgentBridgeBrowserResult` 增加可选 `requestId`，parser 支持 envelope `id` 与 payload `requestId`；App pending request 按 ID 关联乱序响应，旧 Bridge 仅在单请求场景兼容无 ID，多请求无 ID 不更新当前页面。host 切换、断开、页面销毁和 session window 释放会清理旧请求与截图预览；截图预览限制 PNG/JPEG/WebP 和 8 MiB Base64。`npm run check:browser`、Bridge 全量 `npm run check` 与 SDK 23 `assembleHap --no-daemon --stacktrace` 本轮通过。仅尝试向 `5KLBB25A10203862` 安装，因签名 profile 未授权 UDID 返回 HDC `9568423`，未启动或测试；真实 Browser host、App 全量动作和现场恶意页面/上传下载仍待验收。

> 2026-08-08 R9 Usage 事件隔离与持久恢复：新增连接级 usage event router，`usage.updated` 与 `usage.budget.warning` 仅发往同一 `hostProfileId`；没有 host 标识的旧客户端只回送来源连接，避免跨 legacy 连接广播。`UsageManager` 的 budget warning 透传来源连接，新增 recovery smoke 覆盖 actual/estimated、input/output/cache/reasoning/total token、quota、compaction、session/day/month、重复事件和重新创建 manager 后的状态恢复。定向 smoke 与 Bridge 全量 check 本轮均通过，真实 Provider quota/metadata、长会话和现场数据仍待验收。

> 2026-08-08 R10 Web 生命周期源码收口：`app.js` 增加 `reconnectEnabled`、`pageClosing`、`connectionGeneration`、`refreshInFlight` 和 `shutdownTransport()`；pagehide、显式/跨标签 logout 会释放重连/刷新 timer、GitHub watch、terminal subscription、pending RPC 与 BroadcastChannel；全量刷新在 health、agent、workspace、session、diagnostics 和 GitHub 阶段按连接代际丢弃迟到结果，重新登录可恢复 transport。`node --check src/web/app.js`、Web contract/live smoke 与 Bridge 全量 `npm run check` 本轮通过；23B/23D 的真实双标签、旧 Bridge、长流、受支持平台 host 和浏览器现场仍待验收。

> 2026-08-08 R14 Voice endpoint/capability 契约收口：`VoiceManager` 对环境变量和显式进程配置统一拒绝非 HTTPS、用户名/密码和 fragment endpoint；`voice.status.warnings` 只返回稳定脱敏 code。Bridge 默认不宣告本机 audio capture/playback、VAD 或 interruption handling，远程 STT/TTS 仅按有效 HTTPS endpoint 发布；App `AgentBridgeVoiceResult` parser 增加 warnings 和独立 capability false 默认。Voice 定向 smoke、Bridge 全量 `npm run check` 与 SDK 23 `assembleHap --no-daemon --stacktrace` 本轮退出码均为 0；HAP 仅向 `5KLBB25A10203862` 尝试安装，因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；真机音频路由、真实 Provider 和长会话继续待现场。

> 2026-08-08 R15 Provider usage/metadata contract 源码子阶段：Provider usage 在明确返回 unavailable/error/failed 时归一化为 `ok=false`；带认证的 usage endpoint 只允许同 origin HTTPS 重定向，避免 Bearer 头转发到另一主机；Codex App Server 增加结构化 metadata alternatives，Bridge 保留 alternatives/warnings/estimatedUsage 并兼容旧字符串 Provider。Provider usage、endpoint、Codex provider 定向 smoke 本轮均通过；真实 Provider quota、长会话、现场 App 数据仍待 FIELD，未生成或安装 HAP。

> 2026-08-08 R19 Fleet target integrity 源码子阶段：新增 `daemon-target-guard`，Bridge restart/update/rollback handler 与 App Fleet coordinator 共同绑定 `hostProfileId`、`instanceId` 和 `generation`；实例替换、旧代际、host 不匹配和非法 generation 在写操作前结构化阻断，旧客户端缺字段保持兼容。target guard smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过。构建后仅向 `5KLBB25A10203862` 尝试安装，HDC 返回 `9568423`（签名 profile 未授权 UDID），未启动或测试；双 Bridge/跨平台 rolling 仍待 FIELD。

> 2026-08-08 R20 Browser action Preview/Confirm 快照源码子阶段：`NGFAgentHomePage` 保存完整 `AgentBridgeBrowserPayload` 快照，Confirm 只复用预览目标并替换一次性 planId/confirm，不再重读确认期间可变的页面或输入状态；取消、断线和 host 切换清除快照。protocol alignment、target guard、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；未重复设备安装。真实 platform host、HarmonyOS 全量动作、恶意页面和上传/下载仍待 FIELD。

> 2026-08-08 R21 Provider quota snapshot 源码子阶段：`provider.usage.list` 成功刷新后，Bridge 将具备真实 remaining/limit/resetAt 的 Provider quota window 写入现有 host/session/agent/provider scoped Usage store；eventId 按内容摘要幂等，`usage.updated` 只通知同 host，Usage summary 可在 manager 重建后恢复。Provider usage plan/details/warnings/message/remediation 进入 RPC/持久化前做长度限制与 token/private-key 脱敏；provider usage smoke 与 Bridge 全量 `npm run check`（含 R12/R13/voice-platform postcheck）本轮退出码 0，未生成或安装 HAP。真实 Provider quota/凭证、长会话 compaction 与现场 App 数据仍待 FIELD。

> 2026-08-08 R22 Browser host capability metadata 源码子阶段：Browser host list 现在公开 hostKind/runtime/capabilitySource/readiness/supportedPlatforms/capabilityWarnings；显式 HarmonyOS host 缺少 platform capability source 会被拒绝，degraded/unavailable host 不参与 dispatch，CDP host 发布 cdp/chromium/ready metadata。`serverInfo.features` 明确 `browserHostCapabilityMetadata=true`、`browserPlatformHost=false`；manager/CDP/protocol 定向 smoke 本轮退出码 0，未生成或安装 HAP。真实受支持平台 host、HarmonyOS App 全量动作和恶意页面/登录态/上传下载仍待 FIELD。

> 2026-08-08 R11 Web workspace registry 源码收口：Web workspace 区增加 Import/status，workspace 条目接入 `workspace.registry.import/open/archive` preview/confirm、请求 busy guard、结构化 validation/remediation 和归档后的 active workspace 重选；旧 Bridge 缺 import RPC 时回退 `workspace.registry.create`。Web contract/live smoke 与 Bridge 全量 `npm run check` 本轮退出码 0；Open live smoke 只执行 preview，未打开本机路径。真实双标签、旧 Bridge、长流和浏览器现场仍待验收。
> 2026-08-08 R13 Web 旧 Bridge 兼容源码收口：新增 `src/web/compatibility.js`，统一 feature advertisement、serverInfo compatibility、Agent attach/session messages、workspace registry、optional RPC failure 和事件 scope；`app.js` 只在 refresh 阶段生成一次 capabilities，增强入口统一走 `featureEnabled()`，未知事件和跨 scope 迟到事件不更新当前 UI，缺 `session.messages`/registry 时保留旧 attach/timeline 与 Agent workspace fallback。compatibility、Web contract/live smoke 与 Bridge 全量 `npm --prefix tools/agent-bridge run check`（含 postcheck R12/R13）本轮均退出码 0；真实旧 Bridge、多标签、长流和浏览器现场仍待 FIELD。

> 2026-08-07 R2 Git 高风险写操作收口已实际执行 workspace Git/Git Plan、protocol alignment、management CLI/live、MCP host/live 定向 smoke，Bridge 全量 `npm --prefix tools/agent-bridge run check` 退出码 0，SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0（`BUILD SUCCESSFUL`）。HAP 仅保留既有 system-capacity 与 throw-handling 警告；真实远端认证、受保护分支和多人同时修改仓库继续作为现场验收。

> 2026-08-08 R29 Usage event normalization：共享 `UsageManager` 对所有 Provider 事件再次执行数值边界校验，负数/非安全整数 token、quota、compaction 和负 cost 保持 unavailable；仅在 input/output 双侧存在时推导 totalTokens。R29 定向 smoke、usage recovery smoke 和 Bridge 全量 `npm --prefix tools/agent-bridge run check`（含 postcheck）均退出码 0；真实 Provider、长会话和真机展示仍待 FIELD。

> 2026-08-09 R30 Provider Usage freshness：Provider usage result 增加可选 `stale` 语义；有效 `expiresAt` 已过期或 Provider 显式标记 stale 时保留可读快照但不再生成新的 quota Usage event，旧结果缺字段仍按 legacy 行为兼容。freshness smoke、既有 provider usage smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`、`git diff --check` 和 SDK 23 HAP 构建均退出码 0；HAP SHA-256 `C44FACAC5A87F58E75B1B52021A84A31BDAB01E0F9A51D16E23A3F2A2243F24F`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；真实 Provider quota/compaction、长会话和真机展示仍待 FIELD。

> 2026-08-09 R31 Fleet executor failure：`AgentHomeDaemonFleetCoordinator` 将 executor 抛错归一化为稳定首错失败，保留后续 pending，避免异常泄漏到页面层；Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 均退出码 0。HAP SHA-256 `E264D2EED61351B6292F60471DC557271E73C4B7134B5E61082A91EFF810D8C9`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；跨平台、多 Bridge rolling 仍待 FIELD。
> 2026-08-09 R32 Remote config state integrity：远程配置 schema v1 增加版本/scope/priority/values 限制与签名编码校验；Bridge 启动离线 reconcile active/previous/fetched，摘要漂移、损坏 previous、无效来源 URL 会标记 degraded，rollback/apply 在切换或写盘失败时返回结构化错误并保持 plan/当前状态；未知顶层字段以 warning 兼容。R32 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；跨平台 daemon、真实签名配置和双 Bridge rolling 仍待 FIELD。

> 2026-08-09 R33 Voice session state：`VoicePlatformFacade` 现在拒绝后台启动录音，麦克风权限执行 check -> request -> re-check 并公开 `microphonePermission`/受控 `permissionRemediation`；`audioSessionState` 区分 inactive/active/interrupted，主动 deactivate 与系统 deactivation 事件分离，系统中断清理带活动音频检查和 in-flight guard。Voice contract smoke、Bridge 全量 `npm run check`、SDK 23 HAP 构建和 `git diff --check` 本轮均退出码 0；HAP SHA-256 `FC5C1C4EAA590468287463AE444863516CEEA35831322A15113599CD186E7837`。构建后仅向 `5KLBB25A10203862` 尝试安装，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试；真机权限/路由、来电蓝牙和真实 Provider 仍待 FIELD。

> 2026-08-09 R34 Compatibility protocol summary：Bridge `serverInfo.compatibility` 和 App parser/兼容卡补齐 `minimumProtocolVersion`、`recommendedProtocolVersion`、`supportedProtocolVersions`；diagnostics builder smoke、Bridge 全量 `check`、SDK 23 HAP 构建和 `git diff --check` 本轮通过，HAP SHA-256 `730A331A6A8BEAEEDF20D4CA3EC0B809474D2ABA6FFC4FE16BC4AF97CF5F5089`。仅向 `5KLBB25A10203862` 安装一次，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试；第 34 项仍因真实版本矩阵、Provider 长会话和真机展示保持“部分实现”。
> 2026-08-09 R35 Compatibility matrix：旧 Bridge 在只提供 `minimumProtocolVersion` 时按同一协议族数字后缀校验客户端协议；缺少客户端协议或协议族无法比较时降级 `unknown`，低于最低协议时 blocking；compatibility matrix、diagnostics、Agent Experience smoke 和 Bridge 全量 `check`（含 `check:r35`）已通过。本轮未修改 ArkTS，未重复构建或安装 HAP。第 34 项仍因真实版本矩阵、Provider 长会话和真机展示保持“部分实现”。

> 2026-08-09 R56 GitHub WebSocket host scope：真实 Bridge 子进程建立两条 WebSocket `/ws` 连接，验证 `clientHello.hostProfileId` 覆盖伪造 payload、binding/PR plan/watch 的跨 host 阻断、OAuth session 跨 host poll 和断线后 watch subscriber 清理；live smoke 发现并修复 PR update/reviewer/label/merge plan 创建时未保存 `hostProfileId` 的缺口。`node scripts/check-github-host-scope-live-smoke.js`、`npm run check:github-host-scope-live`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮均退出码 0。本轮只修改 Node Bridge、smoke、package script 和文档，未构建/安装/启动/测试设备；真实 GitHub 账号、权限、限流、资产服务和跨设备现场仍待 FIELD。

> 2026-08-09 R57 Daemon remote config WebSocket host scope：`daemonConfigPayloadForConnection()` 将当前连接 `clientHello.hostProfileId` 作为 `daemon.config.*` 的权威范围；apply/rollback plan 绑定 host、instance、generation、source URL、configVersion 和 digest。管理器 smoke 与真实 Bridge 双 WebSocket smoke 验证跨 host confirm 返回 `host_scope_mismatch`、同 host confirm 成功、版本/来源变化使旧 plan 返回 `plan_expired`，以及 rollback 隔离；`check:daemon-remote-config-host-scope-live` 已加入 `postcheck`。本轮 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；只修改 Node Bridge、smoke、package script 和文档，未构建/安装/启动/测试设备；跨平台 daemon、真实签名配置和双 Bridge rolling 仍待 FIELD。

> 2026-08-09 R58 Daemon config CLI/MCP：管理 CLI 的 `daemon config status/fetch/validate/preview/apply/rollback` 均通过 live Bridge RPC 映射；无运行 Bridge 时返回 `live_bridge_required`，不会旁路本地 store，Bridge 结构化 `failureCategory` 会以非零退出码结束。MCP 的 status/validate/preview 为只读，fetch 为 open-world，apply/rollback 为 destructive 且缺少 `confirm=true` 时在触达 Bridge 前返回 `confirmation_required`。CLI/MCP live smoke、Node 语法检查、Bridge 全量 `check`（含 postcheck）和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装设备。第 14 项跨平台安装、自启重启、真实签名配置和双 Bridge rolling 仍待 FIELD。
> 2026-08-09 R59 Usage currency integrity：`UsageManager` 聚合费用时只接受带有效 `currency` 的 cost，币种统一为大写；缺币种费用仍保留在事件级数据，但不进入 actual/estimated 费用 summary，也不伪造 `realCost`/`estimatedCost`。新增 normalization smoke 覆盖缺币种、单侧 token、非法数值、compaction 与重启恢复，并接入 `check:r59`/`postcheck`；本轮未修改 ArkTS/HAP、未安装设备。真实 Provider 账单币种、quota、长会话 compaction 与真机展示仍属于第 22/34 项 FIELD 门。
> 2026-08-09 R60 App usage currency parser：App `parseUsageCosts()` 现在拒绝空/缺失 `currency` 的 cost，并对 usage event、budget 和 budget warning 的币种执行 trim/大写；旧 Bridge 缺少币种时保持 unavailable。M5 parser test 已注册，SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，HAP SHA-256 `E617B8A8289F177AFF0A1421FA9D4DE00D98E352331EB9B3AC01FEC845B61E1D`；本轮未安装、启动或测试设备。真实 Provider 账单币种、quota、长会话 compaction 与真机展示仍为第 22/34 项 FIELD 门。
> 2026-08-09 R61 App quota window：App `AgentBridgeUsageQuotaRecord` 保留 Bridge summary 的可选 `window`，只接受 `session/day/month`，quota 卡复用现有窗口本地化标签展示，缺字段保持 unavailable；M5 parser test 增加 window 断言。SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，HAP SHA-256 `342C96A98AB5B205EBC0F1B08D9106AB2A6B4F84E9040AC49033A0195477D22F`；本轮未安装、启动或测试设备。真实 Provider window 套餐语义仍为第 22/34 项 FIELD 门。
> 2026-08-09 R62 Bridge budget currency integrity：`UsageManager.record()` 与 `budgetSet()` 统一 trim/大写 currency，修复 CLI/MCP 传入小写币种导致 cost budget warning 漏报的问题；normalization smoke 增加预算保存、lowercase cost event 与阈值告警断言，并接入 `check:r62`/`postcheck`。本轮只修改 Node Bridge、smoke、package script 和文档，不修改 ArkTS/HAP；真实 Provider 账单币种与套餐数据仍为第 22/34 项 FIELD 门。
> 2026-08-09 R63 Budget currency migration：Bridge 读取已持久化 v2 Usage state 时幂等 trim/大写 budget currency，修复重启后历史小写 budget 仍漏掉 cost warning 的兼容缺口；normalization smoke 增加旧 budget 读取、恢复和告警匹配，接入 `check:r63`/`postcheck`。本轮只修改 Node Bridge、smoke、package script 和文档，不修改 ArkTS/HAP；真实 Provider 账单与套餐数据仍为第 22/34 项 FIELD 门。
> 2026-08-09 R64 Provider usage capability gate：Bridge Registry 与 Provider Catalog 统一为公开 descriptor 增加可选 `capabilities.providerUsage`；只有真实 `getUsage()` adapter、配置 endpoint 或可用 endpoint 环境变量的 Provider 发布 true，未配置 Provider 发布 false。App parser 增加 explicit capability 与缺字段兼容识别，新的 false capability 隐藏 quota 刷新入口，旧 Bridge 缺字段保持既有全局 feature 行为。Provider runtime capability smoke、Node 语法检查、Bridge 全量 `check`、SDK 23 HAP 构建和 `git diff --check` 通过；HAP SHA-256 `0CF840745E07C4AB3E67945F6EB69CC7945B5883A6022DFB91EC662F719E3E90`。构建后仅向指定设备 `5KLBB25A10203862` 尝试安装，HDC 返回 `9568423`（签名 profile 未授权设备 UDID），未启动、读取日志、截图或测试，也未向其他设备安装。真实 Provider quota、凭证、长会话 compaction 和真机展示仍为第 22/34 项 FIELD 门。

> 2026-08-09 R65 Web multi-tab scope：Web `BroadcastChannel` 消息增加 endpoint 与 hostProfileId scope，接收端拒绝跨 Bridge endpoint/host 的 refresh、workspace、scope 和 session 事件；logout 保持同 endpoint 的多标签传播。workspace.changed 改为只刷新 workspace registry，并在当前 workspace 受影响时刷新 session；scope/session changed 只刷新匹配当前 selection 的 session。新增 `check-web-multitab-scope-smoke.js` 并接入 `check:r65`/`postcheck`；本轮 Web multi-tab 定向 smoke、compatibility/UI contract、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 均退出码 0。未修改 ArkTS、未重新构建或安装 HAP；真实多标签浏览器、旧 Bridge、长流和现场 WebView 仍为 23B FIELD 门。
> 2026-08-09 R48 File transfer event scope：文件上传/下载 progress、completed、failed 生命周期事件改为按发起 WebSocket connectionId 单播；空/未知 owner 默认阻断，server 发送前移除内部 owner，HTTP 兼容 RPC 不向其他连接广播。file-transfer scope、terminal/file IO smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均退出码 0；真实大文件、弱网、浏览器/HarmonyOS App 多连接和断线重连仍待 FIELD。
> 2026-08-09 R49 Terminal event scope：TerminalManager 的 `terminal.updated`、`terminal.attention`、`terminal.capture.persisted` 与 `terminal.stream.exit` 改为按 creator/subscriber connection 单播；空 scope 默认丢弃，server 发送前剥离内部 owner/subscriber，attention notification 不再无范围持久化。terminal event scope、terminal/file IO smoke、Bridge 全量 check 与 `git diff --check` 均退出码 0；真实长流、多连接 App、弱网和跨 host/workspace 权限仍待 FIELD。
> 2026-08-09 R50 Automation runtime event scope：Schedules、Loops、Chat Rooms 内部 automationConnection 产生的 Agent/session/Provider runtime event 改为按已确认 workspace scope 单播；事件优先读取 payload workspace，缺失时由 agentId/sessionId 解析，无法验证 scope 时丢弃。automation runtime scope、R47 scope、三个 automation manager smoke、Bridge 全量 check 与 `git diff --check` 均退出码 0；真实长会话、多 workspace 和权限变化仍待 FIELD。

> 2026-08-09 R51 Notification host scope：通知记录增加可选 `hostProfileId`；Bridge 按 WebSocket `clientHello.hostProfileId` 分组创建 Agent/terminal 通知，notification list/read/action/prune 按当前连接 host 过滤，跨 host 修改返回 `not_found`，内部 automation connection 按 workspace 转发到真实目标连接而不写入 `bridge-automation` host。notification scope smoke、既有 notification smoke、Node 语法检查、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`（含 postcheck）和 `git diff --check` 本轮退出码均为 0；真实多 Host App、Push/AGC 角标和跨设备点击仍待现场验证。

> 2026-08-09 R52 Push host scope：Push subscription 增加可选 `hostProfileId`；status/register/unregister 由当前连接 host 强制过滤，host-scoped notification 只投递同 host token，`notification.push.updated` 只发给同 host 连接，旧无 host notification 保持兼容。Push scope smoke、既有 Push smoke、Node 语法检查、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`（含 postcheck）和 `git diff --check` 本轮退出码均为 0；AGC 权益、真机 token 生命周期、前后台投递和跨设备点击仍待现场验证。

> 2026-08-09 R36 Browser App capability：HarmonyOS App Browser model/parser 接入 `hostKind`、`runtime`、`capabilitySource`、`readiness`、`supportedPlatforms` 和 `capabilityWarnings`，并解析 `browserHostCapabilityMetadata`/`browserPlatformHost` feature；新 capability 下 degraded/unavailable host 只展示诊断、不参与 dispatch，失败类别映射受控 i18n 文案，上传入口明确 workspace-relative 范围。SDK 23 ArkTS 编译、Bridge 全量 `check`、`git diff --check` 均通过；HAP SHA-256 `F15C24A2F0A8BC393F5292984EDB0C317960874D209EE945ECA5BBF795E39461`。仅向 `5KLBB25A10203862` 尝试安装，HDC `9568423`（签名 profile 未授权设备 UDID），未启动或测试；真实平台 host、上传下载和真机现场继续保持 FIELD 门。

> 2026-08-09 R37 Voice playback generation：远程 TTS `AVPlayer` 的 `stateChange` callback 绑定 playback generation 与 player identity，迟到旧播放器事件在状态机入口丢弃；释放时复用同一 callback 注销，并由 stop/release 推进 generation。Voice contract smoke、Bridge 全量 `check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 均退出码 0；HAP SHA-256 `F378C3863E3CA8DF22CF9DF1073E54F1DAFFB3EEB8B62AD0CC39CD20EDA4143D`。本轮没有安装、启动或测试设备；真实 Voice 权限/路由、蓝牙/来电、弱网和 Provider 仍保持 FIELD 门。

> 2026-08-09 R38 Voice TTS cancellation：Bridge `VoiceManager` 为 TTS request 增加 cancelled/request identity gate，stop、owner detach、shutdown 后 Provider 迟到响应在 `tts.ready` 发布前被阻断并归一化为 `voice_cancelled`；取消竞态 smoke 与 Bridge 全量 `check`（含 postcheck）退出码 0。本轮未修改 ArkTS、未构建或安装 HAP；真实 Provider 取消/超时、弱网和真机音频现场继续保持 FIELD 门。

> 2026-08-09 R40 Message Queue Attempt Integrity：`MessageQueueManager` 将持久队列状态迁移到 attempt-aware schema v2；首次 drain 创建 attempt，失败 retry 保留原 `queueId`/`clientMessageId` 并生成新的 `attemptId`/`retryOfAttemptId`，重复 enqueue、重载和 accepted 清理均有断言；App parser 增加可选 attempt history。Agent Experience smoke、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 通过，HAP SHA-256 `C36BA685E954A06001B68458AF6481AAD38A9DAAB7B91798B7CECE6D70B1DCF1`，ArkTS 仅保留既有警告；本轮未安装、启动或测试设备，真实 Provider/真机队列仍待 FIELD。

> 2026-08-09 R41 Daemon Status Generation Integrity：HarmonyOS App 普通 Agent Home 新增 `AgentHomeDaemonStatusCoordinator`，将 daemon status 响应绑定当前 `hostProfileId`、connection epoch 和 request id；旧 request、重复 response、旧 host/epoch、身份缺失/变化以及 generation 回退均不能覆盖当前快照，旧 Bridge 缺少 instance/generation 字段时安全兼容。coordinator 纯逻辑测试已注册，SDK 23 HAP、Bridge 全量 check、Hvigor tasks 和 `git diff --check` 均通过；本轮未安装、启动或测试设备。此证据只覆盖源码完整性子阶段，第 14 项跨平台 daemon、双 Bridge rolling 和真实 heartbeat/健康聚合仍待 FIELD。

> 2026-08-09 R42 Browser Request Scope Integrity：HarmonyOS App Browser pending request 现在保存并校验 `workspaceId`、`hostId`、`instanceId`、`pageId` 和 action；envelope/payload request id 关联优先，多请求 legacy 缺 id 时不猜测，scope 冲突会消费并丢弃请求，缺少可选字段的旧 Bridge 保持兼容。`AgentHomeBrowserRequestCoordinator` 纯逻辑测试已注册，SDK 23 HAP、Browser 定向 smoke 和 `git diff --check` 通过；本轮未安装、启动或测试设备。`browserPlatformHost=false` 不变，真实平台 host 与 Browser 现场仍待 FIELD。

## 2. 核查结论

当前 36 项的真实实现分布为：

- 已实现：1、2、3、4、5、6、7、8、9、10、11、12、13、15、17、18、19、20、24、25、26、27、28、29、30、31、32、35、36。
- 部分实现：14、16、21、22、23、33、34。
- 未实现：无。

与旧版清单相比，主要修正如下：

1. 第 2、10 项已经随 Agent schema v2、隔离 fork、生命周期 coordinator 和对应 smoke 形成标题范围内闭环，不应继续写成“部分覆盖”。
2. 第 4、13、29、31 项的代码实现与现场验证应分开；缺真机、AGC 或双 Bridge 现场并不等于代码未实现。
3. 第 3 项已通过分层 checkpoint 结果明确文件、timeline、Provider runtime 与 terminal transcript 的恢复边界，不再把文件恢复等同于运行时恢复。
4. 第 14 项的签名远程配置、实例身份和 App Fleet 编排已接线；Bridge 将 `daemonFleetOrchestration` 与 `daemonFleetTarget` 分开发布，前者表示中心编排能力（当前为 false），后者表示单实例可被 App 编排（当前为 true）。源码自动化与 SDK 23 构建已验证，跨平台安装、自启重启和多 Bridge 现场仍待验收。
5. 第 18、19、20、32 项已完成 M7：Bridge 持久化 manager、Agent Manager 执行链、协议、CLI/MCP、App 可见管理区和自动化验证均形成闭环，不再保留“只有占位”的过时判断。
6. 旧文档的执行计划与总表相互冲突，并混入大量按日期累积的测试流水；本版改为逐项事实、缺口、实施步骤和验收标准。
7. 第 27、28、35 项已完成 M5 可见闭环；第 22、34 项已具备 Codex、OpenCode 与 Gateway turn usage、独立 metadata turn、Provider quota DTO 和 UI，但真实 quota 凭证/endpoint、compaction 长会话与现场数据仍不足，因此继续属于部分实现。
8. 第 17 项已完成 M6 威胁模型、opaque Relay、端到端加密、设备生命周期、CLI/MCP、App 配对管理和自动化闭环；公网部署与真机网络切换继续作为现场验证，不再影响源码实现状态。
9. 第 23 项必须继续拆分判断：23A Docker 与 23C Service Proxy 已实现；23B Web UI 的 terminal V2、workspace 文件、Git/Diff 三模式与高风险写操作、settings/doctor、GitHub 工作台和 Browser 完整控制端已形成源码 RPC 闭环，但多标签、旧 Bridge、长流、HarmonyOS App 全量动作和真实浏览器现场仍待验；23D Browser Automation 的 Bridge/CDP、instance/page lifecycle、Web 全部动作、action 级 capability 和元素安全检查已完成，但仍缺受支持平台 host、App 全量控制及真实上传下载现场，因此整体为部分实现。
10. 第 6、7 项已完成 R1：Provider profile/env 使用安全引用和公开 DTO，受管目录具备一次性 plan、ownership、rollback/remove 恢复与启动 reconcile；第 8 项已完成 R2，Bridge、CLI、MCP 和 App 已共享权威 Git plan 门禁。
11. 第 21、33 项的本地/远程 capability 解耦、单一 Provider 选择和远程 TTS 播放源码闭环已完成；Voice manager/protocol smoke、Bridge 全量 check 和 SDK 23 HAP 均通过，真实设备音频路由与 Provider 服务仍需现场验收，因此状态继续为“部分实现”。
12. 第 16 项已关闭 Provider secret、目录 ownership/plan、CDP debugger URL authority binding、Browser action 级 capability、CDP drag、元素可操作性检查和 Web 控制端安全门子缺口；受支持平台 host、HarmonyOS App 全量动作与真实恶意页面/登录态/上传下载仍需现场/后续收口，因此整体继续为“部分实现”。
13. R113 将 Browser App upload 从自由路径输入收敛为当前 workspace 文件列表选择，并保持 Bridge 侧 realpath/ownership/摘要安全校验；这补齐了 App 控制链的输入入口，但不替代真实平台 host、上传/下载和恶意页面现场验收。

## 3. 总表

| 编号 | 能力 | 当前实现状态 | 当前验证状态 | 核查结论 |
|---:|---|---|---|---|
| 1 | CLI Provider 真交互式持续会话 | 已实现 | 自动验证已覆盖；Codex 真实会话需按版本复验 | `oneshot/stdio/service` 契约、Codex App Server、stdio 长进程、attach/abort/resume 已接线。 |
| 2 | 子 Agent 与关系体系 | 已实现 | 自动验证已覆盖 | schema v2、parent/child、fork、detach、cascade archive、关系诊断与 App 关系 UI 已形成闭环。 |
| 3 | Checkpoint / Rewind | 已实现 | 2026-07-13 Bridge 全量回归与 SDK 23 构建通过 | files/timeline/runtime/terminal 分层结果已接入；Provider 按 capability 恢复，terminal transcript 可回滚且明确 live process 不变。 |
| 4 | 终端子系统 | 已实现 | 自动验证已覆盖；HarmonyOS 真机待验 | Bridge 端标题所列 attention、snapshot、activity、hooks、mouse 已实现；现场体验另行验收。 |
| 5 | 动态模型/模式/thinking/斜杠命令发现 | 已实现 | 自动验证已覆盖 | Provider Catalog 已成为统一能力事实源，App 按 availability 和 feature gate 使用。 |
| 6 | ACP + 一键 Provider 目录 | 已实现 | 2026-07-30 Provider directory、protocol、CLI/MCP live、Bridge 全量 check 与 SDK 23 HAP 构建通过；真实 catalog/跨平台包待现场验收 | 签名 manifest、HTTPS、ZIP/TGZ 安全安装、App/CLI/MCP、state v2、公开 DTO、一次性 install/rollback/remove plan、ownership、runtime 恢复、版本清理和启动 reconcile 已形成闭环。 |
| 7 | 自定义 Provider 配置 | 已实现 | 2026-07-30 Provider profile security、CLI/MCP host/live、diagnostics、Bridge 全量 check 与 SDK 23 HAP 构建通过；macOS/Linux 安全存储待现场验收 | profile schema v2 将公开配置与 secret 引用分离；Windows CurrentUser DPAPI、明文迁移、env keep/set/remove、运行时解析、公开 DTO、doctor/diagnostics/日志脱敏已闭环。 |
| 8 | Git 高级操作 | 已实现 | 2026-08-07 workspace Git/Git Plan、protocol alignment、management CLI/live、MCP host/live、Bridge 全量 check 与 SDK 23 HAP 构建通过；真实远端/受保护分支/多人协作待现场验收 | changes/diff/stage/commit/pull/push/branch/stash/merge 已实现；discard、可能覆盖本地状态的 pull、force push、branch delete、stash pop/drop、merge 统一要求一次性 preview/planId/confirm，plan 绑定 repository snapshot，App 按可信 feature gate 使用同一门禁。 |
| 9 | GitHub 集成 | 已实现 | 2026-08-15 R160 App 登出入口（`AgentBridgeClient.logoutGitHub()` + Sign out 按钮 + 本地状态清理，HAP 14,547,897 bytes，SHA-256 `9479614D06ECEE66392D91736A22DF3E5174B9F9A84CD2EFB5D1F8AB0DB05A30`）、2026-08-09 R53 host scope、R54 credential store、R55 OAuth session、R56 真实 Bridge WebSocket host-scope live smoke、既有 GitHub client smoke、Bridge 全量 check 与 `git diff --check` 通过；真实 GitHub/资产服务待现场验收 | OAuth Device Flow、安全凭证、账号与 workspace binding、PR 分页/状态/ready/reviewer/label/checks/merge、ETag 受控 watch、附件 preview/confirm 上传及 App 工作台已形成闭环；R53/R56 隔离 host/plan/watch，R54 加固 credential store，R55 清理过期和终态授权 session并保持 pending/slow_down 轮询语义。 |
| 10 | Git Worktree 与 Agent 隔离 | 已实现 | 自动验证已覆盖 | create/list/archive、setup/teardown、isolated fork、owner scope 和清理链已形成标题范围闭环。 |
| 11 | 工作区/项目注册表 | 已实现 | 自动验证已覆盖 | create/import/upsert/archive/open/suggestions/doctor 与 App 设置入口已闭环。 |
| 12 | MCP Server 宿主 | 已实现 | mock 与 live smoke 已覆盖 | stdio MCP、工具目录、Bridge RPC 映射、风险元数据和 confirm guard 已实现。 |
| 13 | 离线推送通知 | 已实现 | R52 Push host scope、既有 Push smoke 与 Bridge 全量 check 本轮通过；AGC/真机待验 | 本地通知、Push subscription、Push REST、token 生命周期和点击路由代码已接通；subscription、delivery 和 push status 现在按 hostProfileId 隔离，旧无 host notification 保持兼容。 |
| 14 | Daemon 后台/日志/自启/自更新/远程配置 | 部分实现 | 2026-08-16 R169 daemon.instance.status 现场复验（status=running/instanceHealth=healthy/workerReady=true/pid=52200/crashLoop=false/46ms，R168 冷却后 Web UI 打开时全部 RPC 25-87ms 无超时）、2026-08-15 R156 App-local availability（Fleet 面板可见性只依据 App 本地编排能力与已保存 host profiles，新增 `AgentHomeDaemonFleetAvailabilityPolicy`，不再依赖当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget`；collect 结果写入前按 hostProfileId 集合一致性校验并保留 host epoch 检查；SDK 23 HAP 14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`）、2026-08-09 R31 Fleet executor failure、R32 remote-config state integrity、R57 remote-config WebSocket host-scope live、R58 daemon config CLI/MCP、R67 daemon config App closure、R73 daemon public-surface、R74 daemon update public-surface、R91 Fleet App 聚合摘要、R107 Fleet interrupted-state persistence、Fleet target-guard smoke、连接池/coordinator 测试、Bridge 全量 check、`git diff --check` 与 SDK 23 HAP 构建退出码均为 0；R67 ArkTS 验证与 HAP 构建实际通过，parser 测试已接入但未单独运行；R73/R74 public-surface smoke 验证 daemon status/health/logs/update 不泄露本机绝对路径、进程命令细节或 saved update state 的环境/凭证字段；R91 HAP SHA-256 `F6B929E21979DF4ECCDCB2B8CDB95E116005FF9F26BC96AB9661BB45F2EF52C1`；R107 HAP SHA-256 `D64245358126016E35BC34FA26E56491C3348CEAD677FBC67A7A2E35EC392DB7`；R110 双 Bridge live smoke、`check:daemon-fleet-live` 与包含新 postcheck 的 Bridge 全量 check 退出码均为 0；指定设备 `5KLBB25A10203862` 未安装、启动或测试；Windows/Linux/macOS 全局安装、自启重启和多 Bridge rolling 待现场验收；R86 增加 Fleet rolling 的 expected/target Bridge/config 版本校验、generation/health 结果传播及 `daemon_version_mismatch`/`daemon_config_version_mismatch` 错误；Bridge 全量 check 退出码 0 | supervisor、自启、自更新、签名远程配置、稳定 instanceId/generation/heartbeat、App host 聚合、健康/版本/config 展示、健康/版本/config 摘要、告警/心跳缺失展示、isolate/re-enable、rolling restart/update/rollback 和首错停止已接线。R32 补齐 remote config schema v1、启动 active/previous/fetched reconcile、摘要漂移与损坏 previous rollback guard、`state_persist_failed` 结构化写盘失败；R57 将当前 WebSocket host 作为 daemon config 权威 scope，并让 apply/rollback plan 绑定 host、instance、generation、source URL、configVersion 和 digest，跨 host confirm 统一阻断；R58 补齐 CLI 六个 config 命令的 live-only 映射、结构化失败退出码和 MCP 风险/确认语义；R67 补齐 App status/validate/preview/apply/rollback 可见闭环、结果详情和来源隐藏；R73 固定公开 config/log marker，裁剪 managed process command/args/cwd/identity 并以稳定日志 warning 替代底层错误；R74 将嵌套 update 与独立 update status 统一为公开 allowlist/marker；R91 将 Fleet 查询结果归一化为强类型摘要，旧 Bridge/不可达实例只读显示且不进入 rolling target；R107 将 App 重启遗留的 rolling `running` 记录转换为 `interrupted/app_restarted`，恢复结果明细但要求重新 preview且不自动执行；coordinator 仍将 executor 异常转换为稳定 failed/pending 结果且不自动回滚；旧客户端缺字段仍兼容。`daemonFleetOrchestration=false` 只表示 Bridge 不是中心 controller；`daemonFleetTarget=true` 表示该 Bridge 可作为 App rolling target。 |
| 15 | 完整管理 CLI | 已实现 | 自动验证已覆盖 | 本地/远程 agent、terminal、permit、provider、workspace、Git、MCP、daemon、security 命令已覆盖。 |
| 16 | 安全加固 | 部分实现 | 2026-08-16 R181 App 端浏览器安全边界真机闭环（浏览器面板渲染 Bridge 权威域名 allowlist `127.0.0.1`、受管下载目录状态 `downloadDirectoryConfigured:true`、action 失败 fail-closed 错误提示；主机/权限 RPC 均按纯 workspaceId 作用域隔离）、2026-08-10 R127 App Browser platform capability fail-closed、R126 Browser event scope、R36 App metadata/readiness gate、R45 Browser event scope、R71 Browser download path public-boundary、R72 Browser download URL public-boundary、R73 daemon public-surface、R74 daemon update public-surface、R95 Browser platform host adapter boundary、R97 encrypted settings secure master key、受控错误边界、Bridge 全量 `check`、SDK 23 HAP 和 `git diff --check` 通过；R127 `check:r126`/`check:browser` 与 Hypium 纯逻辑策略覆盖平台 host 缺 capability、degraded 和旧 external host 兼容；平台 host 隔离、HarmonyOS App 全量动作和现场安全边界待验收 | Host、TLS、bcrypt、Bearer、nonce、防重放和审计已实现；Provider secret DTO、受管 ownership/plan、远程 CDP WebSocket authority binding、hostKind/capabilitySource/readiness gate、平台 host adapter 可用性/注册校验、显式平台 host capability policy、action 级 capability gate、拖拽异常释放、元素可操作性检查、App action 目标快照、App host metadata/readiness 展示、Browser lifecycle owner-scoped event routing、公开 permission/download path/URL 脱敏、daemon public path/process/update DTO、加密设置安全主密钥和 Web 控制端安全门已接线，Bridge 默认不宣告 `browserPlatformHost`，剩余缺口是受支持平台 host、真实恶意页面/登录态/上传下载和现场安全边界。 |
| 17 | Relay + E2E | 已实现 | 2026-07-14 Relay crypto/server/manager、CLI/MCP/protocol smoke、Bridge 全量 check 与 SDK 23 构建通过；公网 Relay/真机网络切换待现场验收 | opaque Relay broker、设备长期身份与会话临时密钥、双向 AES-GCM、重连/背压、撤销/轮换及 App 配对管理已形成闭环。 |
| 18 | Schedules | 已实现 | 2026-07-15 manager/CLI/MCP/protocol smoke、Bridge 全量 check 与 SDK 23 构建通过；长期 DST/daemon 现场观察待补 | 五段 cron、IANA timezone/DST、missed-run、lease、并发、重试、retention、history、run-now、preview/confirm 与 App 管理区已闭环。 |
| 19 | Loops | 已实现 | 2026-07-15 manager/CLI/MCP/protocol smoke、Bridge 全量 check 与 SDK 23 构建通过；真实 Provider 长循环待现场验收 | 独立 worker/verifier Agent、结构化验收、轮次/预算、pause/resume/stop/takeover、隔离 worktree、重启恢复与 App 轮次 UI 已闭环。 |
| 20 | Chat Rooms | 已实现 | 2026-07-15 manager/CLI/MCP/protocol smoke、Bridge 全量 check 与 SDK 23 构建通过；多 Agent 长房间待现场验收 | room/member/message/thread/mention/role/seq/ack/分页/权限、幂等消息、Agent 回环保护、归档及 App 房间管理已闭环。 |
| 21 | Voice | 部分实现 | 2026-08-15 R155 AVPlayer 状态机收口（listener-before-dataSrc、initialized gate、prepare/play 后 generation+player+requestId 复核、release 对称注销/reject gate/仅当前 generation deactivate、completed 与 PCM drain 完成清 ttsRequestId；`check:r155` 接入 postcheck；SDK 23 HAP 14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）、2026-08-11 R153 TTS single-playback、R130 STT cancellation/late-response、R39 Voice TTS client correlation、R38 cancellation、R37 playback generation smoke、Bridge 全量 `npm run check`、SDK 23 HAP 与 `git diff --check` 均通过；R153 HAP SHA-256 `4E04B5F61A58D9777A558B0334A74479EACB2715393622AA430E22FD94E4D29E`；未安装设备；HarmonyOS 真机音频路由和真实 Provider 待现场验收 | AudioKit/CoreSpeechKit、独立 device/remote capability、单一 STT/TTS Provider 选择、远程 STT 不触碰本地识别引擎、远程 TTS `audioBase64` 解码播放、事件/response 双交付单次消费、HTTPS endpoint 校验、脱敏 warning、迟到 capturer/AVPlayer 回调隔离、TTS/STT request cancelled/identity gate、可选 `clientRequestId` 关联和按 client id stop、AudioSession listener cleanup、后台启动阻断、麦克风权限状态/remediation、主动释放与系统中断区分和 in-flight cleanup 已接线；R155 已按 SDK 23 状态机收口压缩音频 AVPlayer（listener-before-dataSrc、initialized gate、prepare/play 后 generation/player/requestId 复核、release 对称注销与仅当前 generation deactivate、completed 与 PCM drain 完成清 ttsRequestId），权限永久拒绝、耳机/蓝牙、来电抢占、弱网及真实语音服务仍需现场证据。 |
| 22 | 用量/配额/自动元数据/compaction | 部分实现 | 2026-08-16 R182 App 用量面板真机闭环（命令面板「会话数据」竖屏入口修复；真机发送消息后用量面板渲染真实用量 10/5/15 tokens + USD 0.15 + 配额 90/100 + 压缩记录 200→80 + 最近用量事件，截图 screen-r182c.jpeg）、2026-08-16 R181 真机发现：App「会话数据/用量」sheet 竖屏入口受阻（底部状态条点击区被输入框扩展区/发送键覆盖，命令面板入口仅 EXPANDED 模式启用，四个点位点击无响应——App 端入口待修复后补真机展示）、2026-08-16 R178 Web Queue 面板现场（队列项 accepted + clientMessageId + attempt 渲染）、2026-08-16 R177 Web Metadata 生成/应用现场（generate→preview→apply→agent title 更新）、2026-08-16 R176 Web Usage 面板现场（hello host 身份修复后 Web UI 显示 actual/estimated/quota/compaction/事件明细完整生产链数据）、2026-08-16 R169 usage 生产链现场复验（usage.summary.get eventCount=9 含 actual/estimated/quota 90/100/compactions=3；usage.events.list 含 R169 会话 actual 事件 input=10/output=5；provider.usage.list fail-closed capability_unavailable 25ms）、2026-08-15 R157 metadata capability gate 一致性（App 端 `supportsMetadataGeneration()` 与 usageEvents 对齐 known 标志语义，旧 Bridge 缺字段保留全局 feature 兼容；SDK 23 HAP 14,545,893 bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`）、2026-08-09 R30 freshness smoke、R66 Provider usage scope integrity smoke、R76 Provider producer integrity smoke、R85 App quota event window parser、R87 Provider recorded session replay、R88 Web Session Experience、R146 Web usage window、Provider usage smoke、Bridge 全量 `npm run check`、`git diff --check` 与 SDK 23 HAP 构建退出码均为 0；R85 HAP SHA-256 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`；真实 quota/凭证、长会话和 metadata 现场待补 | Agent Experience 与 Web Session Experience 已实现 usage/budget/compaction 聚合、查询、事件明细和 UI；`provider.usage.list` 成功刷新后会将真实 quota window 写入 host/session/agent/provider scoped Usage store，内容摘要 eventId 幂等，`usage.updated` 按 host 定向发送，UsageManager 重启后可恢复 quota remaining/limit/resetAt。Provider usage 请求作用域由 Bridge connection 权威提供，Provider 响应中的冲突 host/session/agent/window 会被覆盖并返回稳定 `provider_scope_response_ignored` warning，避免 quota snapshot 跨 Host 搬移；文本进入 RPC/持久化前限制长度并脱敏 token/private key；过期或显式 stale snapshot 仅供只读展示，不再产生新的 quota event。Codex/OpenCode/Gateway producer 现仅在 input/output 双侧存在时推导 total，缺 currency 不伪造 `USD`，负数/分数/超安全范围 token 与非法 cost 保持 unavailable；R76 smoke 已纳入 `postcheck`。Codex producer 现在保留录制响应时间，并按 thread/turn 合并双通道 compaction；R87 fixture 回放覆盖三类 adapter、quota reset、四类 metadata、重复事件和 UsageManager 重建恢复，`check:r87` 已纳入 `postcheck`。Usage event parser 现在仅对 quota kind 或带 quota 字段证据的事件保留安全 Provider 自定义窗口，普通 usage/metadata/compaction 事件仍保持 session/day/month 兼容语义。R146 Web usage window 使 Web summary/events/budget/Provider usage 在 session/day/month 之间显式切换，并对旧 Bridge 回落窗口给出提示。metadata.generate 校验 session/agent/provider/providerSession/workspace/连接 host scope，采用白名单 payload；结果支持 alternatives/warnings/estimatedUsage，requestId/timeout/cancelled 和断开清理已形成源码闭环，旧字符串 Provider 兼容。真实 Provider quota、compaction 长会话和四类 metadata 现场数据仍未完成。 |
| 23 | Docker/Web UI/Service Proxy/浏览器自动化 | 部分实现 | 23A/23C 定向验证通过；23B/23D 的源码控制面、契约和 live smoke 已覆盖，R20 App action Preview/Confirm 快照与 SDK 23 构建通过，真实多标签/平台 host/长流现场待验 | 23A Docker、23C Service Proxy 已实现；23B Web UI 与 23D Browser Automation 的主要 Bridge/Web 控制面已形成源码闭环，App action 现在复用预览目标快照，但标题范围仍包含未完成的现场与 HarmonyOS App/平台 host 能力。 |
| 23A | Docker 容器化 | 已实现 | 2026-07-15 Docker contract smoke、单架构 runtime smoke、linux/amd64+linux/arm64 buildx、Bridge 全量 check 通过；2026-08-09 R75 `check:r75` 与 Bridge 全量 `npm run check` 通过，静态 contract 已纳入 postcheck；runtime 默认 opt-in，显式容器构建/重启未计为本轮通过 | Bridge/CLI/Web 多阶段镜像、uid/gid 10001、healthcheck、/data 与 /workspace 分离、secret 注入、只读 rootfs、资源限制、Provider 注入、备份/恢复和镜像升级回滚已闭环。 |
| 23B | Web UI | 部分实现 | 2026-08-16 R182 刷新风暴治理（5 旧标签 15s 全量刷新致 Bridge 单核 100% CPU 并停摆；app.js document.hidden 跳过 + sessionMessagesStaleFor 停止失效会话轮询，契约 smoke 4 断言）、2026-08-16 R179 Git/Diff 面板现场（changes.get 批量化修复后 main · 445 changed 实时渲染 + 变更列表操作区）、2026-08-16 R177 工作区文件浏览现场（真实目录树 + 文件大小 + Preview/Download）、2026-08-16 R175 Terminal 面板现场（真实 cmd.exe shell 渲染、输入回显、agent-scoped list/capture 复核）、2026-08-16 R174 New Agent 对话框实现（'New' 按钮原无监听器，现 agent.create 全链创建 + 自动选中，契约 smoke 断言）、2026-08-16 R173 Browser 面板现场（browser-section 渲染、permission status 展示区真实数据、Hosts 列表含 capability 元数据、Page URL + New Page 经 UI 创建真实页面）、2026-08-16 R172 composer 长流（真实 Chrome 连续多条 composer 消息，user 文本 + assistant 回显在 Bridge session.messages 完整落库，`message.send` legacy `message` 别名文本丢失缺陷修复 + check:r172 接入 postcheck）、2026-08-16 R170 真实多标签现场（双 Web UI 标签同时登录并渲染完整工作台、6s 稳定、Bridge 两独立 web 客户端连接、session.messages.loaded=0 无风暴）、2026-08-16 R169 Web 工作台会话闭环（create/send/reply/messages 全链 + agent.list 6 个）、2026-08-15 R159 Web Browser permission 状态展示（`browser.permission.get` 消费 + `browser-permission-status` 状态区，refreshIsCurrent 防迟到覆盖，旧 Bridge 静默降级；Bridge 全量 check 退出码 0）、2026-08-09 R65 Web multi-tab scope、R88 Web Session Experience、R13 compatibility、Web UI contract/live、diagnostics、GitHub smoke、Browser UI contract/live 与 Bridge 全量 `check` 通过；R65 增加 endpoint/host 过滤与局部 workspace/session 刷新，R88 增加 queue/usage/metadata 消费和 scope/代际保护，R141 增加 composer token、`@` 补全、键盘选择、`message.send`/旧 RPC 回退和 Bridge token 校验，R146 增加 usage session/day/month scope；真实多标签/旧 Bridge/长流/真实浏览器现场待验 | 同源认证、CSP、workspace registry list/create/import/open/archive、Agent/chat、Service Proxy、Browser host/instance/page 生命周期、navigate/snapshot/screenshot/logs/wait/download/permission/全部 action、terminal V2 subscribe/restore/output/input/resize、workspace 文件浏览/预览/下载、Git stage/unstage/commit/pull/push/branch/stash/merge/discard Web 操作、summary/files/unified 视图、八组 settings/doctor 状态、兼容归一化与旧 attach/timeline/registry fallback、未知事件和跨 scope 事件过滤、受控 remediation/JSON/text 导出、GitHub OAuth/account/binding/PR/checks/watch/attachment 工作台、M5 queue cancel/retry、Usage actual/estimated/token/cost/quota/budget/compaction/event 明细与 session/day/month 窗口、Metadata 四类 preview/edit/cancel 和连接生命周期清理、composer token/mention 与安全消息发送均已接线，高风险动作复用 Bridge plan gate；剩余为多标签现场、真实旧 Bridge、长流、HarmonyOS App 全量动作和现场浏览器能力。 |
| 23C | Service Proxy | 已实现 | 2026-07-16 manager/routing/access/live security smoke、protocol/CLI/MCP/Web smoke、R46 service event scope smoke、Bridge 全量 check 与 `git diff --check` 通过；真实域名解析和长 WebSocket 待现场验收 | workspace service registry、loopback HTTP/WS proxy、可选域名、desired-state 恢复、生命周期清理、一次性 open ticket、scoped HttpOnly session、App/Web Open、凭证隔离和 lifecycle owner-scoped event routing 已形成闭环。 |
| 23D | Browser Automation | 部分实现 | 2026-08-16 R181 App 端 workspaceId 映射修复 + 真机浏览器面板现场闭环（`browserWorkspaceId()` 改取 Bridge 纯 id；真机 ADA-AL00U 上 host/instance/page/permission/download 五路 RPC 全部 ok:true 并渲染：chrome-cdp-field Chromium CDP ready、chromium-cdp 实例、8 真实页面、域名 127.0.0.1、受管下载目录；UI 点击「截图」→ 真实 Chrome PNG 返回；HAP 14,558,784 bytes SHA-256 `D916C77E7A339CCB582CA3A2242AEFBD02A784F3A2E7CF9B9927D9D47A683775`，git diff --check 0）、2026-08-16 R173 CDP host 重连 nonce 修复（Bridge 重启后 0.3s 新 nonce 重连重注册，check:r173 接入 postcheck）+ Web UI Browser 面板经 UI 创建页面现场、2026-08-15 R159 Web permission 状态可见闭环（Bridge 全量 check 退出码 0）、2026-08-10 R127 App platform capability fail-closed、R126 Browser event scope、R36 App capability/readiness、R45 Browser event scope、R71 download path public-boundary、R72 download URL public-boundary、R95 Browser platform host adapter boundary、ready-only dispatch、下载/上传范围和受控错误状态已补；R127 `check:r126`/`check:browser` 与 Hypium 纯逻辑策略覆盖显式 HarmonyOS/platform host 缺 capability 或 readiness 时阻断、旧 external/CDP host 兼容；R71/R72 manager/CDP/live/protocol 定向 smoke 与 Node 语法检查通过，R95 manager/protocol 与 `check:browser` 覆盖默认平台 host 拒绝和注入适配器注册，公开 permission/action/download-list result 不再返回工作区绝对路径或嵌入式下载凭证；R45/R126 定向 event scope、Bridge 全量 check 和 `git diff --check` 均通过；SDK 23 HAP 未涉及；受支持平台 host、真实上传下载和现场恶意页面/登录态待验 | Broker、CDP page/instance/navigation/snapshot/screenshot/logs/wait、click/fill/type/key/hover/select/drag/upload/scroll/evaluate/download、permission、Web host/页面控制面、HarmonyOS App host/instance/page 导航、snapshot/screenshot、全量 action、logs/wait/download/close 入口、hostKind/capabilitySource/readiness gate、平台 host adapter 可用性/注册校验、App platform capability policy、action capability gate、visible/enabled/stable 检查、Browser lifecycle owner-scoped event routing 和公开路径/URL 脱敏已接线；旧 Bridge external/CDP host 缺 metadata 时保留 legacy gate，显式 platform host 缺 `browserPlatformHost`/metadata 时 fail closed，Bridge 默认 `browserPlatformHost=false`，debugger URL 已绑定 base authority，但仍缺真实受支持平台 host、真实浏览器现场和真机动作验收。 |
| 24 | V2 Agent 生命周期 UI | 已实现 | 自动验证及历史构建证据存在 | attention、archive、rename、mode/model、fork/detach/checkpoint 和关系详情已接线。 |
| 25 | 终端 UI 补全 | 已实现 | 2026-07-13 SDK 23 构建通过；真机待验 | renderer 已覆盖 256 色、true color、bright color、alternate screen、scroll region、光标保存恢复、宽字符和跨帧状态。 |
| 26 | 文件上传 UI | 已实现 | 自动验证及历史构建证据存在 | 选择、上传、进度、取消、失败和重试已接 binary frame 链。 |
| 27 | 聊天渲染增强 | 已实现 | 2026-07-14 Agent Experience smoke、Bridge 全量 check 与 SDK 23 构建通过；App policy tests 已注册 | canonical typed AST、轻量 tokenizer、八类工具 registry、todo/diff 专卡、安全 file/link、截断与 fallback 已接线。 |
| 28 | 输入区增强 | 已实现 | 2026-07-14 runtime isolation/protocol smoke、2026-08-09 R40 Agent Experience smoke、Bridge 全量 `npm run check` 与 SDK 23 构建通过 | @workspace/file/agent、可信 composer token、持久队列、取消/重试、clientMessageId 和 durable 消息级 fork 已闭环；队列 state v2 额外记录受限 attempt history，retry 保留 queue/client id 并生成新的 attempt，旧 App 缺字段安全兼容。 |
| 29 | 多主机与工作区导航 | 已实现 | 协调器单元测试存在；双 Bridge/真机待验 | host profile、凭证隔离、epoch 防串线、host-scoped 数据与导航已接通。 |
| 30 | Git/Diff UI 增强 | 已实现 | 2026-08-09 R68 App Diff parser/client/page 分页闭环、workspace Git smoke（文件/行/字节分页）、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 通过；HAP SHA-256 `706F131009D41F5E0D0182B2339C86B897DA3C9899FD2F49EE9223E27437EADE`；指定设备 `5KLBB25A10203862` Offline，未安装；App 现场仍待验 | 三模式 diff、高级 Git、文件/目录/冲突 Symbol、文件/行/字节分页截断、继续加载，以及完整 GitHub 工作流均已接线；旧 Bridge 缺字段时保持首段兼容。 |
| 31 | 通知 UI 增强 | 已实现 | 自动验证已覆盖；AGC/真机待验 | 点击直达、角标、富通知、断线补发、Push token/后台消息链已实现。 |
| 32 | Schedules/Loops/Chat UI | 已实现 | 2026-07-15 App parser 测试已注册、protocol alignment、Bridge 全量 check 与 SDK 23 HAP 构建通过 | Workspace 设置内“自动化与协作”区按独立 capability 展示 Schedules、Loops、Rooms，具备真实列表、编辑、preview/confirm、历史/轮次、成员、消息与 ack 交互。 |
| 33 | 语音输入 UI | 部分实现 | 2026-08-15 R155 AVPlayer 状态机收口（压缩音频 listener-before-dataSrc、initialized gate、完成清理 ttsRequestId，HAP SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）、2026-08-11 R153 TTS single-playback、R130 Bridge STT cancel/owner-detach late-response、R39 Voice TTS client correlation、R38 cancellation、R37 playback generation smoke、Bridge 全量 `npm run check`、SDK 23 HAP 与 `git diff --check` 均通过；R153 HAP SHA-256 `4E04B5F61A58D9777A558B0334A74479EACB2715393622AA430E22FD94E4D29E`；未安装设备；真机键盘/权限/音频链待现场验收 | compact/expanded composer 已按本地优先、远程降级选择单一路径；录音入口与播放入口独立判断 capability，remote_stt 不向本地 CoreSpeechKit 写入音频，迟到 readData、STT/TTS Provider 响应与 AVPlayer 状态回调不会污染新会话，Bridge TTS/STT request 取消/identity gate 与 App delivery identity 单次消费共同阻断迟到或重复音频，AudioSession listener 在 release 时注销，partial/final transcript、远程音频播放、编辑确认、取消、TTS 打断、后台启动阻断、麦克风权限 remediation、音频会话状态和中断清理已接线；R155 已收口压缩音频 AVPlayer 启动状态机，真实设备权限、蓝牙/来电/前后台和长录音仍待现场验收。 |
| 34 | 用量展示与设置/诊断增强 | 部分实现 | 2026-08-16 R176 Web Usage 面板现场 + R174 Web diagnostics 导出现场（真实 Chrome 渲染完整报告、脱敏复核通过）、2026-08-15 R157 metadata capability gate 一致性（HAP SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`）、2026-08-09 R30 freshness/parser smoke、R34 compatibility protocol summary、R35 compatibility matrix、R66 Provider usage scope integrity smoke、R76 Provider producer integrity smoke、R85 App quota event window parser、R87 recorded session replay、R88 Web Session Experience、R146 Web usage window、Provider usage smoke、Bridge diagnostics 定向 smoke、Bridge 全量 `check`、`git diff --check` 与 SDK 23 HAP 构建通过；R85 HAP SHA-256 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`；真实 quota/compaction 数据、真机展示和现场验收待补 | 设置、兼容卡、八组诊断、导出和 remediation allowlist 已实现；兼容卡现在保留 App/Bridge 版本以及协议最低/建议/支持摘要，旧 Bridge 只有 minimum protocol 时按协议族数字后缀校验并安全降级 unknown。Usage UI 已消费 Codex/OpenCode/Gateway turn usage、Provider quota DTO、actual/estimated、budget warning、compaction 字段和最近事件明细；Web Session Experience 进一步补齐 queue、usage、budget、metadata 的可见消费、取消/重试和 scope/代际保护，并支持 session/day/month usage window 选择与旧 Bridge 回落提示。Bridge usage 事件按 host 隔离并支持重启恢复，显式 Provider usage 刷新得到的 quota window 现在进入持久化 Usage summary，重复快照幂等且公开 Provider 文本脱敏；Provider 响应冲突作用域不再覆盖 Bridge connection 的 host/session/agent/window，统一返回 `provider_scope_response_ignored` warning，stale snapshot 不再生成新的 quota event。Codex/OpenCode/Gateway producer 已与 UsageManager 的 unavailable 语义对齐：单侧 token 不推导 total，缺 currency 不伪造 `USD`，负数/分数/超安全范围 token 与非法 cost 不进入结果；R76 smoke 已纳入全量 `postcheck`。Usage event parser 现在仅对 quota kind 或带 quota 字段证据的事件保留安全 Provider 自定义窗口，普通 usage/metadata/compaction 事件仍保持 session/day/month 兼容语义。metadata scope 白名单与 Provider HTTPS quota endpoint 已形成源码闭环，认证重定向不会跨 origin 发送 Bearer，明确 unavailable/error/failed 时准确降级；结构化 metadata alternatives 已进入 Bridge/App/Web 可选结果字段，requestId/timeout/cancelled、scope 校验、断开清理和 CLI/MCP/Web cancel 已形成源码闭环，旧字符串 Provider 兼容。真实 Provider 长会话、套餐数据、四类 metadata 和真机展示仍需现场证据。 |
| 35 | 大屏与效率交互 | 已实现 | 2026-07-14 coordinator tests 已注册、SDK 23 构建通过；真机窗口/键盘待验 | 三档工作台、统一 command registry、快捷键开关、精确 scope refresh 和专用 session SubWindow 生命周期已闭环。 |
| 36 | hook 安装器 + snapshot 背压 + capture 持久化 | 已实现 | 自动验证已覆盖 | 与第 4 项重叠，但标题列出的 Bridge 专项均已有实现。 |

> 第 22、34 项总表的既有 R21/R25/R26 验证字段由 R28/R29 证据补充：R28 live lifecycle 与 R29 UsageManager normalization 已在本轮实际进入 `postcheck` 并通过；总状态仍为“部分实现”，因为真实 Provider quota/compaction/metadata、长会话和真机展示尚未验收。

> R77 补充：App 连接/hello/Push/会话子窗口的缺失版本现在保持 unavailable，不再伪造 `1.0.0`；R77 smoke 已纳入 Bridge `postcheck`。这只修正兼容性元数据来源，不改变第 22、34 项真实 Provider 与真机现场门。

## 4. 逐项核查与详细实施步骤

### 1. CLI Provider 真交互式持续会话

当前事实：`provider-catalog.js`、`provider-registry.js`、`providers/codex-app-server-provider.js`、`providers/codex-app-server-transport.js`、`providers/cli-provider.js` 和 `providers/gateway-provider.js` 已区分 runtime 类型与真实能力。Codex 使用 thread/turn；stdio profile 复用长期进程；oneshot Provider 不伪装可恢复会话。

维护与现场验收：

1. 保持 Catalog 为唯一能力事实源，新增 Provider 时必须显式声明 runtime、interactive、attach、abort、resume 和 checkpointRestore。
2. 为每个新增 adapter 增加“连续两轮发送、进程/服务重启恢复、中断、归档、错误清理”用例。
3. 升级 Codex CLI 后执行 `check:codex-real`，记录 CLI 版本、App Server 协议差异和回退边界。
4. 验收时确认已存在 thread 永不回退 exec，只有 thread 创建前的可恢复启动失败允许回退。

### 2. 子 Agent 与关系体系

当前事实：`agent-manager.js` 已保存 schema v2、`parentAgentId`、`rootAgentId`、`runtimeOwnerId`、forkContext、detached 和关系诊断；`agent-fork-coordinator.js`、`agent-lifecycle-coordinator.js` 负责隔离 fork 与统一清理；CLI、MCP 和 App 已有关系入口。

维护与现场验收：

1. 新增关系字段时同步迁移旧 schema，并保持环路、孤儿和缺失 parent 的修复逻辑幂等。
2. 所有资源创建必须绑定 owner agent：Provider session、terminal、notification route、workspace/worktree 和 managed process。
3. detach 只改变关系根，不应隐式移动或删除用户文件；archive/cascade 必须通过 coordinator 清理运行资源。
4. 回归“parent -> isolated child -> detach -> cascade archive”，核对关系树、进程台账、订阅和 workspace 状态一致。

### 3. Checkpoint / Rewind

当前事实：`file-checkpoint-store.js` 已实现 manifest、hash、dry-run plan、冲突、pre-restore snapshot 和恢复后校验；恢复响应新增 files/timeline/runtime/terminal 四层可选结果。Provider 通过 capability 执行 opaque checkpoint 恢复；terminal checkpoint 恢复 transcript 并明确保留 live process 不变。2026-07-13 Bridge 全量 `npm run check` 与 SDK 23 HAP 构建通过。

维护与现场验收：

1. 保持 `RuntimeCheckpoint` 分层契约，继续区分 timeline cursor、Provider opaque token、terminal transcript/state 和文件 snapshot，不把其中一层成功误报为全部成功。
2. 新增 Provider 时必须显式实现或拒绝 `captureCheckpoint()`、`restoreCheckpoint()`，并返回稳定 capability/failure category。
3. PTY 无法恢复进程内存时继续明确标记 `runtimeRestored=false`，只报告实际恢复的 transcript/cwd/env 元数据。
4. App 继续分层展示 files、timeline、Provider runtime、terminal 结果，并保留 pre-restore 反向恢复入口。
5. 使用真实 Provider 补充 checkpoint -> 后续 turn -> restore -> 再发送，以及进程已退出、token 失效和文件冲突现场验证。

### 4. 终端子系统

当前事实：`terminal-manager.js`、`binary-frames.js`、`managed-process-ledger.js` 已覆盖 create/list/subscribe/capture/kill/rename、attention/activity/hooks、input/resize/mouse、sequenced restore、snapshot 限制和 capture 持久化。

维护与现场验收：

1. 保持 V1 原始帧兼容，同时由 V2 envelope 提供 seq、restoreSeq、source、bytes、truncated 和 warning。
2. 对 subscribe/unsubscribe、断线重连、恢复期间缓冲、重复帧、慢消费者和 capture fallback 做持续回归。
3. 在可识别 HarmonyOS 设备上验证断网期间输出、恢复后 input/resize/mouse、前后台切换和长输出滚动。
4. 将真机发现的问题归入第 25 项 renderer/UI 或本项 transport/manager，避免重复修复。

### 5. 动态能力发现

当前事实：`provider-catalog.js` 和 Provider adapter 已输出 availability、来源、缓存、runtime 和 sessionFeatures；App 解析统一 feature flags，并只允许选择可用项。

维护要求：

1. Provider 探测失败必须返回 degraded/fallback 原因，不能把静态默认模型伪装成实时发现结果。
2. model、mode、thinking、slash/tool discovery 使用同一刷新与缓存策略。
3. App 对 unavailable 项禁用选择，并展示来源与修复建议。
4. 新 Provider 必须先补 capability smoke，再加入默认目录。

### 6. ACP 与一键 Provider 目录

当前事实：本地 ACP catalog 与远程签名目录均已形成闭环。远程目录具备 HTTPS manifest、profile/package SHA-256、ZIP/TGZ 安全解包、受管版本目录、当前/上一版、CLI、MCP 和 App 设置入口。state 已升级为 schema v2，只保存受管 ownership、相对 entryPath、版本、摘要、健康状态与 generation；status/list 使用公开 DTO，不返回完整 profile、env、绝对入口、下载地址或 manifest 内部路径。

维护与现场验收：

1. install、rollback、remove 继续使用安全随机、短 TTL、一次性 plan，并绑定 provider/profile、state generation/digest、版本、目录/包摘要、平台和架构。
2. rollback 只从 manager state 的 version + entryPath 重建入口，执行 realpath、ownership、directory digest 和 runtime test；失败恢复原 profile/runtime/state。
3. remove 必须先证明 profileId 与目录属于 manager state；普通 profile、state 外目录和 symlink 逃逸不得修改磁盘。
4. Bridge 启动继续执行离线 reconcile；active entry、profile ownership、secret/environment 引用、摘要或 runtime 异常只标记 degraded，不联网自愈。
5. 新增包格式、平台或 catalog 发布机制时，保持无安装脚本、无 PATH 修改、无管理员权限，并补同等安全归档与生命周期测试。
6. 真实远程 catalog、官方签发流程和 Windows/macOS/Linux Provider 包安装继续作为现场验收。

### 7. 自定义 Provider 配置

当前事实：`provider.profile.list/upsert/delete/test`、CLI、MCP 和 App 已支持 endpoint、binary、env、enable/disable、clone、runtimeMode 和结构化测试结果；runtime registry/catalog 刷新也已接通。profile schema v2 已将公开配置与 secret 引用分离，公开响应只包含 env key、source、configured、fingerprint 和安全存储状态，不返回 env value 或 secret alias。

维护与现场验收：

1. App 编辑继续使用 keep/set/remove 语义，不通过 list/status 回填秘密值；旧 `env` 仅作为兼容写入输入。
2. 启动迁移发现旧明文 env 时，先写安全存储再原子替换；安全存储不可用时标记 degraded、禁止 RPC 回显，并返回明确 remediation。
3. test 只在 Bridge 内部解析 secret/process environment，区分 binary、执行权限、endpoint/auth、timeout 和协议失败；stdout/stderr、日志、doctor 与 diagnostics 均执行脱敏。
4. Windows 使用 CurrentUser DPAPI 已实测；macOS Keychain 与 Linux Secret Service 继续作为跨平台现场验收。Linux 安全存储不可用时只允许显式进程环境引用，不持久化明文。
5. 新增 CLI/MCP/Profile 字段时必须同时更新公开 DTO 和泄漏扫描，禁止普通 JSON、RPC 或日志重新暴露 secret。

### 8. Git 高级操作

当前事实：`workspace-service.js` 已实现 changes/diff/file、stage/unstage/discard/commit、pull/push/branch/stash/merge 和 diff subscription；`WorkspaceGitPlanManager` 为 discard、pull、force push、branch delete、stash pop/drop、merge 建立一次性短期 plan，并绑定 repository snapshot 与规范化请求。server、CLI、MCP 和 App 共享同一 preview/planId/confirm 门禁；App 仅在可信 Bridge 的 `gitOperationPlans` feature flag 开启时展示高风险按钮。2026-08-07 已完成 protocol alignment、Bridge 全量 check 和 SDK 23 HAP 构建验证。

维护与现场验收：

1. 继续保持 discard、force push、merge、stash drop/pop、branch delete 和可能覆盖本地状态的 pull 使用 preview/planId/confirm；plan 继续绑定 workspace、repository realpath、HEAD、branch/upstream、index/worktree fingerprint 和请求摘要。
2. 保持 Preview 的受影响路径、未跟踪路径、当前分支、目标 ref、remote、ahead/behind、冲突/覆盖风险和规范化参数完整，确认前不得写入。
3. 继续保持 server handler、MCP、CLI、App 消费同一 plan；重复、stale、expired 和 Bridge 重启后的 plan 必须失败。
4. App 继续保存原始请求参数，确认时不得从 preview 结果反推请求；成功只刷新当前 workspace Git scope，旧 Bridge/缺 feature 时隐藏高风险入口。
5. 现场使用真实远端、受保护分支和多人同时修改仓库验证 lease、权限、冲突和 stale plan；失败只重新打开对应缺陷。

### 9. GitHub 集成

当前事实：`github-client.js`、安全凭证 adapter、server handler、CLI、MCP 和 App 已覆盖 OAuth Device Flow、账号与仓库 binding、PR 全流程、checks、ETag/退避 watch、issue search、附件链接提取和外部资产上传。高风险操作使用绑定仓库及 head SHA 的一次性 plan。

维护与现场验收：

1. OAuth token 继续只进入 DPAPI/Keychain/Secret Service 或环境变量路径，任何新状态接口均不得回显 token。
2. PR 修改、merge 和附件 plan 继续绑定账号、仓库、PR/head SHA 与文件摘要，并保持一次性消费。
3. Watch 继续在最后一个订阅者退出时停止，页面/连接生命周期不得遗留后台轮询。
4. 将 `github-credential-store.js` 的语法和安全 smoke 正式加入全量 `check`。
5. 使用真实 GitHub 账号、组织权限、限流、token 撤销和资产服务验证；现场失败只重新打开对应缺陷。

### 10. Git Worktree 与 Agent 隔离

当前事实：`workspace-service.js`、`agent-fork-coordinator.js` 和 lifecycle coordinator 已把 preview/confirm worktree、setup/teardown、isolated fork、owner scope 与清理连接起来。

维护与现场验收：

1. worktree create/archive 继续保持路径校验、Git registry 校验和 preview 零写入。
2. setup 失败要返回可恢复状态；teardown 失败必须阻止删除并保留现场。
3. isolated child 的 Provider、terminal 和文件操作必须使用 child workspace scope。
4. archive 只软归档 registry，不自动删除未明确授权的用户目录。
5. 持续回归幂等 confirm、重复 branch、stale/locked/prunable 和 daemon restart 后所有权恢复。

### 11. 工作区/项目注册表

当前事实：`workspace-registry.js` 已支持 list/create/import/upsert/archive/open/suggestions/doctor，包含 project grouping、active/archived/missing/stale 等诊断；CLI、MCP 和 App 已接线。

维护要求：

1. create/import/archive/open 保持 preview 与 confirm 分离。
2. 重复 cwd 应更新或恢复既有记录，不创建不可区分的重复 workspace。
3. archive 只改 registry 状态，不删除磁盘内容。
4. 目录建议和 editor launcher 失败返回结构化 remediation。
5. 多主机隔离继续由第 29 项 hostProfileId 约束。

### 12. MCP Server 宿主

当前事实：`mcp-host.js`、`mcp-stdio-server.js` 已实现 initialize、tools/list、tools/call，并映射 agent、terminal、provider、workspace、Git、GitHub、notification、daemon 和 security 等 Bridge RPC。

维护与现场验收：

1. 新增 Bridge RPC 时同步决定是否暴露 MCP 工具，并补 schema、annotations、risk metadata 和映射测试。
2. destructive 工具必须 confirm；list、status、preview、dry-run 可保持只读例外。
3. 文件字节继续走 binary frame，不把大文件直接塞进 MCP JSON。
4. 增加外部 MCP client 长时间连接、事件订阅、重连、取消和背压现场测试。

### 13. 离线推送通知

当前事实：`notification-manager.js`、`push-notification-manager.js`、server push handler、NGF Push 门面、`EntryAbility.ets` 和 Agent Home 已形成 notification store、subscription、Push REST、token 生命周期、后台消息与点击路由代码链。R51 将通知记录、list/read/action/prune RPC 和 Agent/terminal 通知投递绑定到连接声明的 `hostProfileId`；R52 进一步将 Push subscription、register/status/unregister、host-scoped delivery 和 `notification.push.updated` 绑定到同一 host。不同 Host Profile 只读取、修改和接收自己的通知/token，缺少 host 的旧客户端继续使用无范围兼容行为，内部 automation connection 不写入虚构 host。

现场验收：

1. 准备带 Push 权益的 AGC 项目、签名 Profile、服务账号和项目配置，敏感材料只放安全环境。
2. 真机注册 token，确认 Bridge 只返回 fingerprint，不回显原始 token。
3. 依次验证前台、后台、锁屏、进程被杀、token 更新、注销和跨设备投递。
4. 验证 permission/question/plan/completion/terminal attention 的去重、TTL、点击路由和断线补发。
5. 记录厂商错误码、限流和 token 失效 remediation；完成后仅更新验证状态，不再修改实现状态。

### 14. Daemon 后台、自启、自更新与远程配置

当前事实：`daemon-supervisor.js`、`autostart-manager.js`、`daemon-update-manager.js`、`daemon-remote-config-manager.js`、diagnostics、CLI/MCP/App 已覆盖 supervisor、heartbeat、crash-loop、自启、安全自更新、签名远程配置和稳定实例身份。`AgentHomeDaemonFleetConnectionPool.ets` 按 host profile 临时读取凭证、有限并发查询 `daemon.instance.status`，并在生命周期操作后轮询 generation 与健康状态；`AgentHomeDaemonFleetCoordinator.ets` 已接入 Agent Home 的实例列表、isolate/re-enable 和 rolling preview/confirm/执行链。R67 进一步让 App 远程配置面板展示 active/previous/fetched 版本、摘要验证和 degraded 状态，并提供 host-scoped status/validate/preview/apply/rollback 交互；来源 URL 只显示配置存在，不回显查询参数。旧 Bridge 缺少 instanceId 时仅只读展示，不进入 rolling target；Bridge feature flag 明确拆分为 `daemonFleetOrchestration=false` 与 `daemonFleetTarget=true`。R105 修正了 Fleet action `failureCategory` 在 App executor 与 coordinator 之间丢失的问题；host lifecycle/连接池停止现在保留 `cancelled` 状态并让后续目标保持 `pending`，Hypium 纯逻辑测试已覆盖该语义。R106 新增 Fleet run control，页面销毁/host 切换在步骤边界返回 `interrupted` 和受控 reason，已完成与待处理目标不丢失。R107 新增 `AgentHomeDaemonFleetRunStore`，将 rolling 记录按版本化 settings 持久化；App 重启读取旧 `running` 时归一化为 `interrupted/app_restarted`，恢复结果明细但必须重新 preview，不自动执行，损坏记录安全降级。

源码剩余与现场步骤：

R122 进一步要求每个 rolling target 自身显式发布 `features.daemonFleetTarget=true`。Fleet connection pool 对 capability 缺失、无效或明确关闭的目标 fail-closed：保留只读实例/健康摘要，但不生成 rolling eligible target；warning 仅以数量进入聚合摘要，不回传远端 warning 文本。该 gate 防止“有 instanceId”被错误解释为“允许客户端编排”，且不把 `daemonFleetOrchestration=false` 的 Bridge 误判为中心 controller。

R123 将上述 capability 和 warning 元数据通过 `cloneDaemonFleetSnapshot()` 传递到 Agent Home rolling preview；页面不再使用旧字段列表重建 snapshot，因此 preview、excluded/pending 分类和告警摘要继续与 connection pool 的权威快照一致。

R156 将 Fleet 面板可见性改为 App-local availability：新增 `AgentHomeDaemonFleetAvailabilityPolicy`，面板只依据 App 本地 fleet orchestration 能力与已保存 host profiles（hostProfileId + endpoint 非空）显示，不再读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；Fleet 面板从 daemon 诊断区移出为独立设置 stage，当前活动主机旧版或离线时其他已保存 host 仍可查询展示。每个目标仍由自身 `features.daemonFleetTarget` 与实例身份 fail-closed 门控（R122），preview 继续把不 eligible/isolated 目标放入 excluded；`refreshDaemonFleet()` 结果写入前新增 hostProfileId 集合一致性校验（`matchesCurrentProfiles`），与既有 connectionEpoch host epoch 检查共同保证迟到批次不覆盖当前快照。新增 Hypium policy 测试注册 `List.test.ets`；SDK 23 HAP 构建（14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`）和 `git diff --check` 本轮通过。

1. 继续扩展连接池和 coordinator 定向测试，覆盖 host lifecycle epoch、连接取消、不可达、版本不兼容、App 重启中断和 isolate 状态持久性；R105/R106 已覆盖取消分类、步骤边界中断和 pending 保留，R67 增加远程配置 parser 与确认状态机测试。
2. 在真实 Windows/Linux/macOS 全局安装上验证 instanceId 稳定性、自启重启、update/rollback 后 generation 与健康恢复，以及失败实例的首错停止结果。
3. 使用两个以上真实 Bridge host profile 验证 A → B → A 切换、旧 epoch 响应丢弃、同 endpoint 不同 profile 和凭证不串线。
4. 现场验证只更新本项的验证证据；若发现源码行为缺口，只重开对应子步骤，不回退已通过的单实例配置和 supervisor 能力。

### 15. 完整管理 CLI

当前事实：`desktop-launcher.js` 已覆盖 agent、terminal、checkpoint、permit、provider、workspace/worktree、Git/GitHub、notification、MCP、daemon 和 security，本地/远程连接与 follow/wait 已实现。

维护要求：

1. 新 RPC 同步 CLI 命令、帮助、结构化 JSON 输出和退出码。
2. 显式远程目标失败时不得回退本地 store。
3. TTY 与非 TTY 的交互差异必须稳定，非交互缺选择时返回明确错误。
4. follow/attach 的 Ctrl+C 只脱离客户端，不停止远端任务。

### 16. 安全加固

当前事实：`auth.js`、`security-audit.js`、server/WebSocket、diagnostics 和 CLI 已覆盖 timing-safe bearer、bcrypt、Host allowlist、TLS、nonce 防重放、token/auth 变更断连和设备信任管理元数据。R1 已关闭 Provider profile/directory 的敏感回显、secret 持久化、受管 ownership、一次性 plan 和远程 CDP debugger target authority 缺口；R7 已补齐 browser host action capability、CDP drag 和元素 visible/enabled/stable 检查；`webSocketDebuggerUrl` 现会在连接前校验协议、凭证、fragment、host/port、loopback/远程范围和 HTTPS → WS 降级。

剩余实施步骤：

1. 受支持平台 host 必须提供真实的凭证隔离、输入/下载/上传边界和生命周期清理；不支持的平台准确返回 unavailable，不按平台名称推测能力。R95 已将该要求固化为 `browser-platform-host.js` 适配器契约：平台 host 注册必须先通过适配器可用性和注册校验，默认 Bridge 保持 unavailable。
2. App/Web 补齐 navigate/action/logs/download/close 后，敏感输入、上传、下载、evaluate 和 close 继续使用一次性 preview/confirm，并保持正文遮蔽和审计最小化。
3. 框架加密设置主密钥必须由 AssetStoreKit 托管；旧 AppStorage 密钥只能在安全存储可用时一次性迁移并清空，安全存储不可用时必须 fail closed，禁止固定静态密钥或普通存储新写入。R97 已完成该源码边界并接入 smoke。
4. Provider directory、profile、Browser、Push subscription 和 diagnostics 继续纳入统一敏感字段 allowlist/denylist 回归。
5. 保持认证配置损坏 fail closed、nonce 在 `101` 前校验、token/auth 变更断连和 Relay 独立设备认证边界；定期执行依赖审计、恶意 Host、非法 hash、token 轮换和旧连接失效测试。

### 17. Relay 远程访问与端到端加密

当前事实：`relay-crypto.js`、`relay-identity-store.js`、`websocket-client.js`、`relay-server.js` 和 `relay-manager.js` 已实现 Bridge 侧完整链路；`RelayCryptoFacade.ets`、`AgentBridgeClient.ets`、Relay policy 与 Agent Home 设置区已实现 App 侧配对、加密连接和设备管理。Relay 只路由 opaque frame，解密后的连接复用现有 Agent Bridge V2 parser、binary frame、生命周期与 capability gate，本地直连路径保持不变。

当前实现链：

1. `docs/agent-bridge-relay-threat-model.md` 固化 Relay 可见元数据、端点信任边界、恶意 Relay/MITM 假设、配对 secret 生命周期、撤销、轮换与现场验收边界。
2. Bridge 和 App 分别持有 P-256 长期身份；每次连接生成新的临时 ECDH keypair，通过 HKDF-SHA256 派生 App -> Bridge 与 Bridge -> App 两把独立 AES-256-GCM 密钥。
3. canonical transcript 与 AEAD AAD 绑定协议版本、双方身份、relay/session id、nonce、direction、seq 和 key epoch；重复、跳号、旧会话、方向错配或认证失败均在业务解析前关闭会话。
4. Relay broker 只处理 register/attach/frame/ack/detach 外层 envelope，并实施帧大小、连接数、队列、TTL 与慢消费者限制；重连创建新 nonce、临时密钥和序列空间，不恢复旧 cipher。
5. Bridge RPC、CLI、MCP 和 App 已覆盖 status、pairing、connect/disconnect、device list/revoke 与 identity rotate；撤销和身份轮换使用一次性 preview/confirm，App host profile 只保存公开 endpoint，私钥由 AssetStore 保存。
6. Relay crypto/server/manager smoke 覆盖 transcript 修改、重放/乱序、opaque 路由、分片、长流、背压、撤销和真实 broker 重连；协议、CLI 与 MCP 对齐测试已纳入 Bridge 全量 `check`，App parser、envelope、KDF/AAD/transcript 和 UI policy 测试已注册。

现场验收：使用生产 TLS 公网 Relay 验证 NAT/蜂窝切换、弱网重连、真机前后台、长终端流和大文件；现场失败只重新打开对应缺陷，不反向把已完成的源码闭环标成未实现。

### 18. Schedules

当前事实：`schedule-manager.js` 已实现版本化持久状态、五段 cron、IANA timezone、DST 不存在/重复本地分钟处理、`skip/run_once/catch_up` missed-run、单实例 lease、并发 `skip/queue`、重试退避和 history retention。所有 create/update/enable/disable/run-now/remove 写操作均采用一次性 preview/planId/confirm，执行复用现有 Provider session 与 Agent Manager。

实现闭环：

1. `schedule.status/list/get/create/update/enable/disable/run-now/history/remove`、`schedule.updated` 和 `schedule.run.updated` 已接协议、server、CLI、MCP、App client 与 parser。
2. App Workspace 设置的“自动化与协作”区可新建/编辑 cron 与 timezone、启停、立即运行、查看 history 和移除，并按 capability 隐藏旧 Bridge 不支持的入口。
3. daemon 重启会把运行中记录转为 interrupted；runner 通过 lease 防止同一状态目录多实例重复触发，history 按每个 schedule 的保留策略清理。
4. smoke 已覆盖 cron 步进、DST 跳时/重复时刻、重试、并发、lease、missed-run 和重启恢复，并纳入 Bridge 全量 `check`。
5. 生产时区长期运行和系统休眠/唤醒后的真实触发时间继续作为现场证据，不影响源码闭环状态。

### 19. Loops

当前事实：`loop-manager.js` 已将 worker 与 verifier 分别路由到独立 Agent，verifier 必须返回 `passed/checks/remediation` 结构化结果并覆盖全部 acceptance criteria。Loop 保存每轮 Agent、输出、verification、usage、终止原因和 generation；isolated 模式通过现有 workspace service 创建受管 worktree。

实现闭环：

1. `loop.status/list/get/create/update/start/pause/resume/stop/takeover/rounds/remove` 与 updated/round updated 事件已接协议、server、CLI、MCP、App client/parser/UI。
2. 支持最大轮次、token/cost/currency/duration budget、pause/resume、用户 stop、人工 takeover 和迟到结果 generation 防覆盖。
3. daemon 重启将 running/pausing/stopping 安全降级为 paused，并把活动 round 标记 interrupted；用户可显式 preview 后继续。
4. App 可编辑 worker/verifier prompt、验收条件、最大轮次和 shared/isolated 模式，并展示状态、轮次 verification、暂停、继续、停止、接管和移除入口。
5. smoke 已覆盖 verifier 合同、失败 remediation 进入下一轮、预算耗尽、多币种、pause/resume/takeover、最大轮次和重启恢复。

### 20. Chat Rooms

当前事实：`chat-room-manager.js` 已实现 room/member/message/thread/mention/role、稳定递增 seq、`clientMessageId` 幂等、前后分页、ack/unread、owner/moderator/member/viewer/agent 权限和归档只读。连接 actor 由 Bridge 连接身份派生，不信任客户端传入的 actor 字段。

实现闭环：

1. `chat.room.status/list/get/create/update/archive/member.add/member.update/member.remove/message.post/message.list/ack` 和 room/message/ack 事件已接协议、server、CLI、MCP、App client/parser/UI。
2. Agent 只响应对活动 Agent member 的显式 mention，单条消息最多 fan-out 5 个 Agent；Agent 响应清空 mention 且 routing depth 受限，阻断自动回环。
3. App 可创建/编辑/归档房间、添加 Agent、切换 Agent/viewer 角色、移除成员、提及、回复、发送幂等消息和标为已读。
4. pending/running delivery 在 daemon 重启后标记 interrupted；归档保留可分页历史但阻止新消息与成员修改。
5. smoke 已覆盖角色权限、重复消息、seq/ack/分页、fan-out 上限、Agent 回环、归档和重启恢复。

### 21. Voice

R96 补齐远程 PCM/raw 播放的采样深度边界：Bridge 结果中的 `sampleBits` 由 App 转发到 NGF media contract，缺省为 16 位；媒体层将 8/16/24/32 位映射到 SDK 23 的 U8/S16LE/S24LE/S32LE，并拒绝其他值。该源码子阶段的 Voice contract smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 已通过，真机音频路由和真实 Provider 仍不计入源码通过。

当前事实：NGF media 层已使用 SDK 23 AudioKit 封装 AudioCapturer、AudioRenderer/AVPlayer、AudioSessionManager 和中断处理，并以 CoreSpeechKit 提供设备侧 STT/TTS；Bridge 提供独立 HTTPS STT/TTS Provider adapter。App 现在把本地与远程 capability 分开：本地 STT 可用时不创建 Bridge Voice session，本地不可用且远程 capability 可用时才上传音频。TTS 在本地与远程之间固定选择一路，Bridge 返回的 `audioBase64` 经 parser 校验后交由 NGF media 播放并统一清理。

源码已实现：

1. `voice.status/session.start/session.chunk/session.finish/session.cancel/tts.speak/tts.stop` 与 transcript/VAD/TTS/session 事件已接协议、server、CLI、MCP、App client/parser。
2. 录音固定为 16 kHz、mono、S16LE；App 使用官方 `readData` callback，将 PCM 严格切为 640-byte chunk，并按 sequence 上送。
3. Bridge 对 chunk 顺序、速率、单块/会话大小、TTL 和响应大小设限；完成、取消、过期、断线与 shutdown 均清零内存音频 Buffer。
4. STT/TTS 未配置、设备引擎不可用或权限拒绝时返回稳定 capability/failure category，不回退到伪听写或伪 VAD。
5. AudioSession、流级 interrupt、页面消失和 Ability 前后台生命周期均会停止录音/播放并释放焦点；重复 cleanup 幂等且清零内存音频。
6. R43 新增 `AgentHomeVoiceRequestCoordinator`：远程 STT start/finish/cancel 与 host/epoch、request id、Bridge session id 和取消状态绑定；迟到 session/transcript/VAD 结果不会覆盖当前 Voice UI，页面退出和 host 切换会清理请求状态。

R118 新增 `AgentHomeVoicePlaybackCoordinator`：TTS 初始化、device/remote playback completion 与当前 playback generation、hostProfileId、connectionEpoch 绑定；页面消失、host quiesce、用户中断和新一轮播放会使旧回调失效。该 App 状态 race 已由 Hypium 纯逻辑测试和 SDK 23 HAP 构建验证，但不替代真机 AudioKit 路由、权限、蓝牙/来电、弱网和真实 Provider 现场。

R155 收口压缩音频 AVPlayer 状态机：`VoicePlatformFacade` 按 SDK 23 官方顺序 createAVPlayer -> idle 注册 `stateChange`/`error` -> 设置 `dataSrc` -> 等待 `initialized` -> `prepare()` -> `play()`，每个异步阶段用 generation + player 身份 + requestId 复核；`NGFRemotePlayerInitializationGate` 带 10 秒超时且只 settle 一次，release 对称注销 listener、reject gate 唤醒初始化等待者且不产生未处理 rejection，仅当前 release generation 才 deactivate AudioSession；正常 completed 与 PCM/raw drain 完成都清 `snapshot.ttsRequestId`，App 播放协调器因此能 complete 并清除页面 TTS mode。该源码子阶段的 `check:r155`（已接入 postcheck）、Bridge 全量 check、SDK 23 HAP 构建（14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）和 `git diff --check` 本轮通过；真机音频路由、权限、蓝牙/耳机、来电、弱网和真实 Provider 仍由第 21、33 项 FIELD 管理。

R150 补齐远程 Voice 数据保留状态：`voice.status.privacy` 仅公开 STT/TTS 是否转发数据、受限 retention 策略/来源/可选时长、整体状态和是否需要用户提示；endpoint、token、原始环境变量、音频及 transcript 均不进入 DTO。受控策略只允许 `not_retained`、`ephemeral`、`retained`，未知或非法值 fail closed 为 `unknown` 并返回稳定 warning。App 使用可选 `voicePrivacyStatus` capability 解析并提示未知远程保留策略，host 切换会清空旧 status。该源码子阶段已由 R150 smoke、Bridge 全量 check 和 SDK 23 HAP 构建覆盖，但它只是保留声明的公开/兼容边界，不替代真实 Provider 合同、保留期、地域或删除审计；第 21、33 项继续保持“部分实现”。

现场验收与后续补强：

1. 在真机确认本地 STT/TTS 不依赖 Bridge endpoint，且设备权限撤销后安全降级为文本输入。
2. 在真实 Provider 下确认远程 TTS MIME/采样率/声道、AudioRenderer/AVPlayer 输出和单次播放。
3. 补充耳机/蓝牙、来电/其他媒体抢占、前后台、弱网、长录音和进程终止后的资源清理证据。
4. 现场失败只重开对应平台或 Provider 缺陷，不回退已通过的协议和自动化实现。
5. 对每个真实远程 STT/TTS Provider 核验保留声明、地域、删除策略和声明变更后的用户提示，不以 `operator_declared` 代替 Provider 的现场证据。

### 22. 用量、配额、自动元数据与 compaction

当前事实：`agent-experience-manager.js` 已定义统一 usage event，并按 host/session/agent/Provider 和 session/day/month window 持久聚合；真实值与 estimated 分开，多币种费用不跨币种求和，quota 与 compaction 保留来源和 ISO 时间。Budget、查询、parser 和 UI 已存在。Codex App Server adapter 已处理 `thread/tokenUsage/updated`，将规范化 turn usage 附加到 completion；`thread/compacted` 与 `item/completed(type=contextCompaction)` 现在按 thread/turn pending state 顺序无关地合并并去重，优先保留 item 的原因、前后 token 和权威完成时间；另实现不污染主 timeline 的 `generateMetadata()`（sessionTitle、branchName、commitMessage、pullRequest）。R81 进一步保留 Codex metadata turn 的 usage 快照，Bridge 将其规范化为 `kind=metadata`，按当前 host/session/agent 写入 UsageManager 并通过 `usage.updated` 通知 App，重复 Provider event id 幂等去重。R131 又将 Codex compaction producer 的 eventId 改为基于稳定 item/compaction id、turn id 或受限快照的确定性值，并以有界 producer dedup 阻断断线重放/重复通知的二次发布；UsageManager 仍作为持久层幂等 backstop。OpenCode adapter 已按 Paseo `step-finish` part 规范化 input/output/reasoning/cache read/cache write/total token、cost/currency，并处理结构化 `compaction` part；两类 OpenCode usage 均按 part id 去重，且有独立 provider smoke。Gateway adapter 已按 OpenAI Responses `response.completed` 与 Hermes Studio `run.completed`/HTTP completion 规范化 token/cache/reasoning/cost，并按响应 id 去重；Gateway 没有稳定 compaction 事件契约，字段保持缺失。套餐 quota 由 `provider-usage-service.js` 通过 Provider `getUsage()` 或受限 `AGENT_BRIDGE_CODEX_USAGE_URL` 按需读取；缺少 endpoint/凭证时返回 `capability_unavailable`。R87/R131 增加脱敏录制协议 fixture 回放 smoke，覆盖三类 adapter、quota reset、compaction 双通知顺序及重放幂等、四类 metadata 和 UsageManager 重建恢复；该证据仍不替代真实账号、账单和现场长会话。其他 Provider 仍可准确降级，不能把全局 capability 当作每个 Provider 都支持。

已实现部分：

1. `usage.summary.get`、`usage.events.list`、`usage.budget.get/set` 与 updated/warning 事件已接协议、server、client、parser 和页面。
2. 缺失 token/cost/quota 保持 unavailable，不补零；Provider 无真实 quota 时不伪造数据。
3. 队列、usage、budget 和 metadata 全部校验 hostProfileId、host epoch、sessionId 与 agentId，旧 host 响应不会污染当前 UI。
4. App 展示六类 token、actual/estimated、多币种费用、quota/reset/provider、compaction timeline 和非阻断 budget warning。
5. App 已具备 usage、quota、compaction 与 metadata preview/edit 的展示和操作底座。
6. R142 补齐 Web metadata apply：sessionTitle 只更新当前 session，branchName/commitMessage/pullRequest 分别转交 Git/GitHub 的 preview/confirm 或 dry-run/confirm；metadata service 不直接写工作区，commit plan 的 staged paths 与仓库 snapshot 校验已纳入 smoke。

剩余实施步骤：

1. 继续为其他可提供数据的 adapter 规范化真实 usage/compaction 事件；Codex 已完成 turn、metadata 和双通道 compaction producer，OpenCode 已完成 `step-finish`/`compaction` producer，Gateway 已完成 Responses/Studio usage producer；无法提供的 compaction 或费用字段保持缺失。
2. 如需要 estimated usage，建立明确 tokenizer/估算来源并标记 `estimated=true`，不得把估算写入真实费用或 quota。
3. Codex fake App Server fixture 已覆盖四种 kind、branch 结构化失败、临时 thread 清理和主 timeline 零污染；继续补真实/录制响应的超时、取消、凭证和长会话证据。
4. `usageEvents` 和 `metadataGeneration` 在协议层保持可选；App 已消费 Provider descriptor 的 capability，并在当前 Provider 不支持时隐藏 metadata 入口。R157 已把 `supportsMetadataGeneration()` 与 `supportsUsageEvents()` 对齐为同一 known 标志语义：新 Bridge 发布显式 capability（含 false）时按显式值 fail-closed，旧 Bridge 缺字段保留 `serverInfo.features.metadataGeneration` 全局 feature 兼容行为；`metadataGenerationCapabilityKnown` 由 parser 按 capabilities 键出现填充，M5 parser 测试断言已扩展。真实 session capability 与其他 Provider producer 的现场证据仍由 FIELD 管理。
5. 增加真实/模拟 Provider usage、compaction、metadata 超时/取消/失败、多币种和 quota endpoint 测试；R81 已补 metadata usage event 的实时记录、host scope 和重复请求幂等 smoke。
6. R82 已修正 Usage summary 的 quota window 聚合键、token/cost 聚合溢出和 budget token 上限边界；不可安全表示的聚合值保持 unavailable，真实 Provider 多窗口账单和真机展示仍需 FIELD。
7. R83 已修正同一 quota window 的乱序快照回退：summary 按 `occurredAt` 选择最新事件，相同/无效时间使用稳定 `eventId`，事件历史仍追加保留。
8. R87 已补齐 Codex producer 的权威时间和 compaction 顺序合并，并以录制 fixture 回放三类 Provider、四类 metadata、quota reset、重连后的 UsageManager 恢复；`check:r87` 已接入 Bridge `postcheck`，真实 Provider/现场数据仍待 FIELD。
9. R115 已将 Web Session Experience 接入 `provider.usage.list` 直读结果，展示套餐、quota windows 和 details；R146 又增加 session/day/month usage window 选择、统一请求 scope 和旧 Bridge 回落提示；`providerUsage` feature 与 Provider capability 双门控，旧 Bridge/无能力 Provider 安全隐藏。真实 Provider quota/账单、长会话和现场数据仍待 FIELD。

### 23. Docker、Web UI、Service Proxy 与浏览器自动化

当前事实：23A Docker 与 23C Service Proxy 已完成标题范围内源码闭环；23B Web UI 和 23D Browser Automation 的 Web/Bridge 源码控制面已完成，R10 又收口了 connectionGeneration、pagehide/logout shutdown、重复刷新合并和迟到刷新丢弃，但整体仍受多标签、旧 Bridge、长流、HarmonyOS App、平台 host 和真实浏览器现场约束。Web UI 和 Browser 继续复用现有 HTTP/WS 协议与 capability gate，不能把 Web 控制端等同于 desktop browser host。

Docker 实现闭环：

1. `tools/agent-bridge/docker/Dockerfile` 使用 Node 22 多阶段构建，验证 native `node-pty`，最终以 uid/gid 10001 运行，并通过 tini 启动 supervisor。
2. `/data` 作为完整 Bridge Home 一致性卷，`/workspace` 单独挂载，外部 Provider binary 只读挂载到 `/opt/ngf/providers`；镜像不包含用户凭证或 Provider CLI。
3. `/health` 使用 Node 内置 HTTP 检查；Compose 默认只绑定 loopback，并启用 read-only rootfs、tmpfs、cap drop、no-new-privileges、CPU/内存/PID 限制。
4. Bridge 支持 `AGENT_BRIDGE_TOKEN_FILE` Docker secret；容器模式关闭 daemon 原地 update/rollback，升级采用固定镜像 tag + `/data` 备份/恢复。
5. Provider 目录在容器中使用 `bsdtar` 安全处理 ZIP/TGZ；仍禁止安装脚本、PATH 修改和管理员权限。
6. contract/runtime smoke 已提供独立脚本，并通过 `check:r75` 接入 `npm run check` 的 `postcheck`。静态 contract 每次全量回归执行；runtime smoke 默认受控 skip，显式设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 后才验证 build、health、非 root、只读 workspace、持久 state 和资源限制，避免隐式重型构建。runtime 构建、跨架构镜像与生产卷恢复仍需单独现场验收。

Web UI 已实现部分：

1. 同源静态资源、Bearer 首次验证、host/origin 绑定的 HttpOnly SameSite session、一次性 WebSocket ticket、CSP、安全响应头、响应式布局和断线重连已接通；logout 会清理 Web session。
2. Agent list/create/select、显式 `session.messages` chat 恢复、workspace registry list/create/import/open/archive/select、Service Proxy 与 Browser host/instance/page/action 控制入口已存在；Web 已覆盖完整 Browser 控制面，HarmonyOS App 仍为基础 Browser 入口，但已补 request ID 乱序关联、生命周期清理和受限截图预览。
3. Terminal 使用 `terminalBinaryFrames`/`terminalActivity` capability gate，已提供 list、bounded capture、create、close 和 V2 subscribe/restore/output/input/resize/backpressure；Git/Diff 使用结构化 changes/diff API，已提供文件状态、增删摘要、summary/files/unified 视图和 file/line cursor 继续加载；workspace 文件浏览/受限预览/一次性下载、notification read/action、八组 settings/doctor、compatibility/remediation 和 diagnostics JSON/text export 已接线。

4. Web 连接由 `connectionGeneration` 绑定，旧 socket 的 open/close 和迟到刷新不会覆盖当前状态；`refreshInFlight` 合并定时器、手动和跨标签全量刷新。`pagehide`、显式 logout 和跨标签 logout 统一释放 timer、watch、terminal subscription、pending RPC 与 BroadcastChannel，登录表单可重新启用 transport。

5. R88 Session Experience 区域按 capability gate 消费 message queue、usage summary/events/budget 和 metadata preview；queue 支持 cancel/retry，Usage 展示 actual/estimated、token/cost/quota/budget/compaction/event 明细。R115 又接入 `provider.usage.list` 直读套餐、quota windows、details 和 freshness，R146 增加 session/day/month usage window 选择、scope key 隔离和旧 Bridge 回落提示，复用 `providerUsage`/Provider 双 capability gate。R142 将 metadata 的 sessionTitle、branchName、commitMessage、pullRequest 四类 Apply 接入既有 agent/Git/GitHub preview/confirm 链，体验刷新绑定 host/workspace/agent/session/provider scope，并在提交状态前校验连接代际；旧 Bridge 缺字段时隐藏增强区。

Web UI 剩余实施步骤：

1. 在真实旧 Bridge 上验证缺 capability/字段的安全降级、不可达状态和兼容提示；当前源码已使用 optional request 与 fallback，R88 体验区只在对应 flag 为 true 时显示。
2. 增加多标签、刷新恢复、长终端流、大 diff、真实 Provider usage/metadata 和浏览器现场测试；现有 contract/live smoke 不能替代这些流程。
3. 保持 R10/R88 生命周期约束的 contract 断言，后续涉及 Web 连接、体验刷新或 metadata cancel 时必须同时覆盖 shutdown、代际、scope 和重新登录路径。

Service Proxy 实现闭环：

1. `ServiceProxyManager` 持久化 workspace/owner scoped service definition，cwd realpath 必须位于 workspace，命令以 `shell:false` 和受限环境启动，上游固定 loopback。
2. upsert/start/stop/remove 使用 preview/confirm；managed-process ledger、`desiredState`、daemon reconcile、Agent/workspace archive cleanup 和日志/health/端口冲突均已接通。
3. HTTP 与 WebSocket proxy 只转发白名单头；Bridge bearer、Cookie、Proxy/X-Forwarded 头和访问票据不会进入 upstream。Service 停止或退出会关闭活动隧道。
4. `workspace.service.open` 生成绑定 service/owner/Host/PID/startedAt/TTL 的单次 URL，首次请求换取 service-scoped `HttpOnly; SameSite=Strict` 短会话并 303 清除票据。
5. 可选 service domain 使用精确 Host 路由；同 namespace 未注册 Host 返回 404，不回落 `/rpc`、`/health` 或 Web UI。
6. CLI、MCP、App 和 Web UI 已提供 list/status/health/upsert/start/stop/logs/remove/open；旧 Bridge 通过 `serviceProxy` feature gate 安全隐藏。

Browser Automation 已实现部分：

1. `BrowserAutomationManager` 只接受显式注册的 browser host capability，并按 workspace/Agent/connection scope 调度；host 断开会清理 pending command，超时、结果归属、结果体积和 action capability 不匹配均有稳定限制。
2. 协议覆盖 instance/page lifecycle、navigate/back/forward/reload、accessibility snapshot、PNG screenshot、console/network logs、wait、action、download 与 permission；写操作后 element ref 失效，stale ref 返回稳定错误。
3. 通用 Chromium CDP host 复用内置 WebSocket 客户端，不新增依赖；默认只连接 loopback CDP，远程 CDP 必须显式 `--allow-remote-cdp` 且使用 HTTPS。`/json/list` 返回的 debugger URL 会再次绑定 base endpoint 的协议与 host/port authority，拒绝凭证、fragment、TLS 降级和网络范围跳转；外部浏览器进程不会被 Bridge 隐式终止。
4. 导航仅接受无嵌入凭证的 HTTP(S) URL并受 workspace 域名 allowlist 约束；上传 realpath 必须位于 workspace，下载固定进入 `.agent-bridge-downloads`，输入、拖拽、上传、下载、evaluate 和关闭操作统一 preview/confirm。
5. 安全审计只记录 request type、workspaceId、agentId、hostId、pageId 与结构化结果类别，不持久化输入正文、脚本、上传文件内容或 screenshot 数据。
6. CLI 与 MCP 已覆盖只读、open-world 和 destructive 风险元数据；Web 在 `browserAutomation` feature flag 为 true 时提供完整 host/instance/page、导航、日志、下载、权限和 action 控制，HarmonyOS App 复用同一 Bridge RPC 并按 capability/readiness 安全降级。R159 又补齐 Web 的 `browser.permission.get` 状态消费（`browser-permission-status` 展示 allowlist 域、受管下载目录状态、更新时间），与 App 端 R69 展示对齐，迟到结果经 refreshIsCurrent 丢弃，旧 Bridge 缺 RPC 静默降级。
7. HarmonyOS App 已提供 host/instance/page/permission、create/close、navigate/back/forward/reload、snapshot、screenshot、logs、wait、download 和全量 action 控件；响应 envelope `id`/payload `requestId` 按 pending 表关联，截图仅接受 PNG/JPEG/WebP 且限制 8 MiB。R36 又补齐 host metadata/readiness 展示、ready-only dispatch、受控错误/remediation 与 upload workspace scope；真实平台 host、真实上传下载、恶意页面/登录态和真机现场仍待验收。

8. R113 新增 workspace 文件选择策略：App 只有在当前 workspace 文件列表中选中普通文件时才启用“使用已选工作区文件”，并把已验证的相对路径填入 upload action；目录、失效选择和跨 workspace 条目不可提交。该策略不把 App 本地 URI 或 Bridge 绝对路径送入 Browser host，最终文件安全校验仍由 Bridge 完成。

Browser Automation 剩余实施步骤：

1. 保持 Chromium CDP 作为当前 Node/desktop adapter；只有存在真实受支持的平台 host 时才注册对应 capability，HarmonyOS/普通 Web 不按平台名称猜测能力。
2. 完成并验证 R36 App host metadata/readiness、ready-only dispatch、受控错误/remediation、下载状态和 upload workspace scope；继续复用同一 Bridge RPC、capability gate 和 preview/confirm，敏感输入不得在 UI 直接回显。
2. R36 App host metadata/readiness、ready-only dispatch、受控错误/remediation、下载状态和 upload workspace scope 已完成并通过本轮源码验证；继续在真实 desktop/platform host 上验证 visible/enabled/stable、跨域、恶意页面、登录态、真实上传下载和 host 清理。
3. 在真实 desktop/platform host 上验证 visible/enabled/stable、跨域、恶意页面、登录态、真实上传下载和 host 清理；当前 Bridge/CDP smoke 与 R36 App parser/UI 测试只覆盖可自动化源码边界，不能替代现场证据。

### 24. V2 Agent 生命周期 UI

当前事实：`NGFAgentHomePage.ets` 已接入 attention clear、archive/cascade、rename、mode/model、fork/detach/checkpoint 和关系详情。

维护要求：

1. UI 继续只按 server feature 和 Provider capability 显示操作。
2. 所有 destructive 操作保留确认与结果反馈。
3. archive/cascade 后同步清理本地 session 映射和当前选择。
4. 新生命周期字段同步更新模型解析、持久化、详情 UI 和资源文案。

### 25. 终端 UI 补全

当前事实：`AgentBridgeTerminalRenderer.ets` 与页面代码已有 sequenced restore、CSI/OSC/SGR、256 色、true color、bright color、alternate screen、scroll region、光标保存恢复、宽字符、typed Span、resize、快捷键、rename、mouse、选择和复制。2026-07-13 SDK 23 HAP 构建通过，真机交互保留在现场验收轨道。

维护与现场验收：

1. 冻结并记录当前支持的 CSI/OSC/SGR 与 screen buffer 子集；若后续要求完整 xterm 兼容，应作为独立 renderer 升级，不把当前日志终端能力误写为完整终端模拟器。
2. 持续回归 256 色、true color、alternate screen、scroll region、光标保存恢复、宽字符、组合字符和随机跨帧状态。
3. 保持最大行数、Span 数、单帧处理时间和恢复序列上限，防止长输出拖垮 UI。
4. restore ready 前继续禁止 input、resize、mouse，恢复完成后再统一开放交互。
5. 在 HarmonyOS 真机补充 ANSI corpus、超长输出、中文宽字符、选择复制、触控 mouse 和前后台恢复验证。

### 26. 文件上传 UI

当前事实：App 和 `file-transfer-manager.js`/binary frames 已覆盖选择文件、目标路径、进度、取消、失败和重试。

维护与现场验收：

1. 保持上传目标受 workspace root 限制，拒绝路径穿越和覆盖敏感文件。
2. 大文件使用分块、序号、摘要和重试，不在 JSON/MCP 中传完整字节。
3. 取消后清理临时文件和 transfer record。
4. 回归断线、重复 chunk、摘要不符、空间不足和目标冲突。

### 27. 聊天渲染增强

当前事实：Bridge 对完整 completed/timeline 消息生成 canonical AST；流式 delta 只更新正文，不覆盖 AST。节点覆盖 text/code/link/file/tool/todo/diff/warning/fallback，并限制节点数、UTF-8 字节、代码行数和 token 数。App 通过 `AgentHomeRichContentPolicy` 二次校验 workspace identity、相对路径、行号和 URL，再渲染 tokenizer、todo/diff 卡、八类工具卡或统一 fallback。

实现闭环：

1. ArkTS/TypeScript/JavaScript、JSON、Shell 和 Diff 使用轻量 tokenizer；未知语言或 tokenizer 失败使用纯文本。
2. File node 必须匹配 Bridge 原始 workspaceId，且路径通过绝对路径、盘符、控制字符、`..` 和行号上限检查后才可打开。
3. Todo 必须包含结构化 id、status 和 source；普通文本不会被猜测为 todo。
4. Tool registry 覆盖 file、shell、Git、GitHub、checkpoint、terminal、permission 和 plan，未知工具安全降级。
5. policy/parser 测试已覆盖 traversal、workspace mismatch、非法行号、恶意链接、未知 node/tool 和 fallback。

### 28. 输入区增强

当前事实：Composer 已支持 workspace/file/agent 范围内的 `@` 补全和强类型 token；Bridge 会重新校验 scope/路径。Message queue 持久保存 clientMessageId 幂等关系并公开 queued/sending/accepted/failed/cancelled、cancel 和 retry；state v2 保存最多 20 条受限 attempt history，retry 复用 queue/client id 并生成新的 attemptId，旧 state/旧 App 缺字段仍安全降级。只有完成的 assistant turn 具有 durable messageId + timeline epoch/seq 时才显示消息级 Fork。

实现闭环：

1. 补全支持过滤、上下键、Enter、Esc、失效 scope 和焦点恢复；普通文本中的 `@` 不会自动升级为可信 token。
2. Provider busy 时按 catalog 能力立即执行、排队或返回 `provider_busy`，App 不伪造并发。
3. 重连后按 clientMessageId 合并队列/用户消息，单条 queue event 也能幂等更新可见状态。
4. 消息 Fork 固定 preview → confirm，plan 绑定 boundary message/cursor/context digest/workspace mode；stale 或重复 plan 会失效。
5. Child context 只注入边界前的脱敏 chat-history 一次，失败重试不会重复注入。

### 29. 多主机管理与工作区导航

当前事实：`AgentHomeHostCredentialStore.ets`、`AgentHomeHostSwitchCoordinator.ets`、持久化仓库和页面已实现稳定 hostProfileId、凭证隔离、host-scoped 数据、确认切换、epoch 防旧回调和 Host 分组导航。

维护与现场验收：

1. 保持 credential 只进入 AssetStore，普通持久化仅保存 credential 引用和 fingerprint。
2. 所有异步回调携带 host epoch，切换后拒绝旧 host 响应写入 UI。
3. session、workspace、notification route 和缓存键必须包含 hostProfileId。
4. 用两个临时 Bridge 执行 A -> B -> A 往返、延迟响应、断线重连、应用重启和同 endpoint 不同 profile 测试。
5. 真机验证完成后只更新验证状态；若发现串线，再回到 coordinator/持久化层修复根因。

### 30. Git/Diff UI 增强

当前事实：App 已接 changes、三模式 diff、高级 Git、subscription、worktree、GitHub 完整工作流、文件状态 Symbol 和 Diff 继续加载；Bridge diff 响应提供文件、行和字节分页及截断原因。

维护与现场验收：

1. 保持文件扩展名、目录和冲突状态使用 NGF/系统 Symbol，不引入 Emoji 或不可复用图标映射。
2. 保持 summary/files/unified 三模式共享 source/result 与分页缓存，切换模式不重复拉取未变化内容。
3. 冲突文件继续提供明确状态与安全动作，不自动覆盖用户修改；高风险 Git 写操作的 Bridge 侧 plan 收口归第 8 项。
4. PR 认证、review、mergeability、checks 轮询和附件能力继续复用第 9 项 GitHub 工作流，不在 Diff 页面复制后端。
5. 在真实大仓库验证文件/行/字节分页、追加去重、性能指标、二进制文件和纯文本降级。

### 31. 通知 UI 增强

当前事实：页面、`EntryAbility.ets` 和 NGF notification/push 门面已覆盖点击直达、冷启动/`onNewWant`、角标、富通知、断线补发与 Push 后台消息。通知 store 与 Bridge RPC 已按 hostProfileId 做连接级隔离，跨 host 的 read/action 被阻断，unread count 按当前 host 计算。

维护与现场验收：

1. 每个通知保存稳定 route：hostProfileId、agent/session/request/terminal 和可选 message anchor。
2. 冷启动等待持久化和 host 恢复后再消费 route，消费成功后幂等清除。
3. 系统角标以未读 registry 为唯一来源，避免本地发布次数造成漂移。
4. 增加 message-level anchor 和完整后台策略；Push 现场步骤与第 13 项共用。
5. 真机验证点击、重复通知、旧 host route、已归档 agent 和离线 action 重放。

### 32. Schedules / Loops / Chat UI

当前事实：App 已增加明确的 schedule/run、loop/round/verification、room/member/message/ack 模型、parser 和 client payload；Workspace 设置内新增“自动化与协作”区域，按 `schedules`、`loops`、`chatRooms` 独立 capability 显示，不建立平行页面或空壳入口。

实现闭环：

1. Schedules UI 提供列表、创建/更新、cron/timezone、enable/disable、run-now、history 和 remove；所有风险写操作消费 Bridge preview 返回的同一 planId。
2. Loops UI 提供 prompt/verifier/criterion/max rounds/workspace mode 编辑，以及 start/pause/resume/stop/takeover、round history 和 remove。
3. Rooms UI 提供 room 编辑/归档、成员列表、Agent 添加/角色切换/移除、mention/reply、稳定 clientMessageId 消息发送、history 和 ack。
4. M7 事件只在相关设置 UI 可见时触发最小范围刷新；旧 Bridge 缺少 `chatRooms` 等 flag 时默认 false，原有 workspace/profile 功能保持可用。
5. `AgentBridgeM7Parser.test.ets` 已注册，protocol alignment 同时断言 Node/App 常量、server handler、CLI/MCP/client/parser 和 feature flag；SDK 23 HAP 构建已验证可见链可编译。

### 33. 语音输入 UI

R96 还修正了远程音频 profile 的可见闭环：TTS 结果中的 `sampleBits` 不再在 App/媒体边界丢失，PCM/raw 8/16/24/32 位选择对应 AudioRenderer 格式，缺字段仍安全回退 16 位；这不替代真机权限、路由和中断现场验收。

当前事实：Agent Home 实际使用的 compact/expanded composer 已接录音、partial/final transcript、编辑确认、取消、TTS 打断和生命周期释放。录音开始后按 capability 选择 `device_stt` 或 `remote_stt`，本地模式不创建 Bridge session，也不上传音频；远程 TTS 结果由 App parser 交给 NGF media 播放层。本地与远程 TTS 不再同时启动。

R155 收口远程压缩音频的 AVPlayer 启动状态机（listener-before-dataSrc、initialized gate、prepare/play 后 generation+player+requestId 复核、release 对称注销与 gate 唤醒、正常 completed 与 PCM drain 完成清理 `snapshot.ttsRequestId`），App 端 `handleLocalVoiceSnapshot` 在 ttsRequestId 清空后触发播放协调器 complete 并清除页面 TTS mode；`check:r155` 已接入 postcheck，Bridge 全量 check、SDK 23 HAP 构建（SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）和 `git diff --check` 本轮通过。真机权限、蓝牙/耳机、来电、前后台、弱网长录音和真实 Provider 仍为现场验收。

源码已实现：

1. compact/expanded composer 共用开始、结束、取消录音动作和状态模型，请求期间禁用重复操作。
2. partial/final transcript、VAD、权限拒绝、Provider/设备能力不可用和中断状态均有可见反馈；确认后只写入草稿，不绕过原有发送确认与队列。
3. 最近 assistant 文本可触发 TTS，播放中可立即打断；录音开始也会停止正在进行的 TTS。
4. 页面离开、App 后台和 Ability 销毁会取消会话、停止 TTS、解绑 `readData` 并释放 AudioCapturer/AudioSession。
5. 新文案已通过 i18n updater 写入中英文资源，图标使用系统 Symbol；Voice parser、protocol alignment、Bridge 全量 check 与 SDK 23 HAP 已通过。

现场验收与后续补强：

1. 在真机验证“仅设备”“仅远程”“双能力”三种 capability 组合、权限拒绝和文本降级。
2. 验证耳机/蓝牙、来电/其他媒体抢占、前后台、弱网、长录音和进程终止时的清理。
3. 使用真实 Provider 验证远程 TTS 输出格式、播放失败提示、停止/打断和不重复播报。
4. 现场失败只重开对应平台或 Provider 节点，不把本次源码 smoke 结果改写为现场通过。

### 34. 用量展示与设置/诊断增强

当前事实：显示设置、兼容提示和诊断导出已经形成闭环：显示偏好通过 `ngfSettingsStoreFacade` 保存并 clamp；`DiagnosticsReport` 固定八组，支持脱敏 JSON/text、复制、系统文件导出和受控 remediation actionId；`serverInfo.compatibility` 是权威兼容结果，App 版本来自 BundleInfo 构建元数据。Usage 页面已消费第 22 项强类型 summary/event/budget，并新增 `provider.usage.list` 结果展示 actual/estimated、token 分类、多币种费用、Provider quota window、budget warning 和 compaction timeline。Codex 已有 turn usage、metadata usage 事件、双通道 compaction 去重和 metadata producer；R131 进一步保证同一 Codex compaction 在重放时使用稳定 eventId，并在 producer 端有界去重后再进入 UsageManager。R142 进一步把 Web 四类 metadata Apply 的结果刷新和 Git commit plan 纳入第 22/34 的可见闭环。R78 又将 `usageEvents`、`providerUsage`、`metadataGeneration` 收敛到 Registry 的 runtime method/producer marker 与安全 HTTPS endpoint，避免静态 descriptor 误报能力。R79 为 Provider usage 结果补充 `availabilityState`，让 App 区分 unsupported、available-empty、available、failed、stale 和 loading，并保留旧 status/ok/stale 兼容；但真实套餐 quota endpoint、凭证、长会话事件恢复和现场数据仍未形成关闭证据。

已实现部分：

1. 聊天字号 12–22、代码字号 11–20、行高 18–32，compact density 与快捷键开关作为跨 host UI preference 保存。
2. 兼容状态统一为 compatible、upgradeRecommended、appTooOld、bridgeTooOld、unknown；缺字段时 unknown 不阻断旧能力。
3. 诊断报告按 daemon、provider、terminal、queue、usage、secureStorage、remoteConfig、persistence 分组并实施大小上限。
4. App 只执行 allowlist 中的现有安全跳转/刷新，不执行服务端下发的命令字符串。
5. parser/policy 测试覆盖缺字段、未知 action、unavailable、多币种、quota、compaction 和报告截断。

剩余实施步骤：

1. 以 Codex 已完成的 turn/metadata usage 与双通道 compaction producer 为基线，补齐真实/录制长会话 fixture，并验证页面从事件、聚合、重连到持久恢复的完整显示。
2. capability 和页面状态必须区分“Provider 不支持”“支持但尚无数据”“数据加载失败”和“当前窗口为空”，不得用全零统计伪装未提供数据。
3. Quota、费用和 budget 按 Provider、currency、host/session/window 保持隔离；estimated 数据继续单独展示且不进入真实配额判断。
4. 增加真实/模拟 Provider 长会话、compaction、quota reset、budget threshold、断线恢复和旧 Bridge UI 测试；设置、兼容与诊断子项可继续保持已实现。
5. R9 已补齐 Bridge 连接级 usage event scope 与 UsageManager 持久恢复 smoke；后续只需补真实 Provider quota/metadata、长会话和现场 App 数据，不得用同 host mock smoke 替代现场关闭门。
6. R115 将 Web 端 Provider usage 直读、详情展示和手动刷新纳入同一 scope/capability 约束；R146 又补齐 session/day/month usage window 选择与旧 Bridge 回落提示。真实 Provider、旧 Bridge 多标签和真机展示仍未形成关闭证据。

### 35. 大屏适配与效率交互

当前事实：`AgentHomeWorkbenchCoordinator` 按页面实际宽度提供 compact（<720 vp）、medium（720–1199 vp）和 expanded（>=1200 vp）布局；三档共享同一 host/workspace/session/detail 状态。Command registry 同时驱动命令面板、菜单和快捷键；VisibleScopeCoordinator 精确合并当前范围刷新。专用 Session SubWindow 只加载目标消息、queue、usage 和 terminal。

实现闭环与现场验收：

1. Expanded 使用 scope、conversation、detail/terminal 三栏；medium 使用双栏；compact 保持单栈。窗口尺寸变化只重排，不重复订阅。
2. 快捷键覆盖命令面板、发送、取消、聚焦 composer、terminal、刷新和栏位聚焦；输入/Dialog 聚焦时屏蔽冲突命令。
3. Chat/files/changes/terminal/doctor/details 各自只刷新当前 scope，同 scope 在途请求合并并校验 host epoch。
4. SessionWindowCoordinator 复用同会话窗口，支持不同会话并存，并在直接关窗、host/session/workspace 失效或数据清理时释放资源，不停止 agent。
5. 真机键盘、平板/折叠屏连续缩放、SubWindow 手势和长会话性能继续作为现场验收。

### 36. Hook、Snapshot 背压与 Capture 持久化

当前事实：`terminal-manager.js` 已实现 hook status/preview/install/uninstall、profile 备份、capture 文件、persisted/error 事件、snapshot 大小上限和 persisted-tail fallback；MCP/App 有入口，主要逻辑与第 4 项重叠。

维护与现场验收：

1. 保持 preview 零写入，install/uninstall 必须 confirm，并只修改带受管 marker 的片段。
2. profile 写入前创建同目录备份，失败时原子回滚，不覆盖用户无关 shell 配置。
3. snapshot 达到上限时返回截断元数据和恢复来源，不静默丢弃。
4. capture 文件执行大小/保留期清理，并在 doctor 中报告目录可写性和占用。
5. 本项只维护 Bridge 专项；终端显示兼容性归第 25 项，真机 transport 体验归第 4 项。

## 5. 推荐执行顺序

实施工作应按依赖关系推进：

1. P0 R1 已完成：第 6、7 项已关闭；第 16 项的 Provider secret、受管 ownership/plan、远程 CDP 二次目标校验、Browser action capability、CDP drag 和 Web 控制端安全门已完成，剩余平台 host/App 全量动作并入 R7/FIELD 轨道。
2. P1 下一步：完成第 8 项 Bridge 权威 Git preview/planId/confirm，再完成第 14 项 App 多实例聚合、rolling/isolate 可见链、测试注册和准确 feature flag。
3. P2 Usage/Metadata 与 Voice：第 21、33 项的源码语音闭环已完成，下一步只保留真实设备/Provider 现场验收；第 22、34 项继续补至少一个真实 Provider 的 quota/compaction/metadata 现场证据。
4. P3 浏览器表面：第 23B workspace/terminal/Git-Diff/notification/settings/GitHub/Browser Web 工作台源码已形成闭环；第 23D 的 drag/action capability 和 Web 全部动作已完成，继续完成平台 host、HarmonyOS App 全量操作和现场验收。
5. P4 验证与维护：对已实现项补真实 Provider、GitHub、AGC、双 Bridge、Relay、公网服务、HarmonyOS 真机、多窗口和跨平台 daemon/Docker 现场证据；若现场发现源码缺口，再只重开对应条目。

同一阶段内优先完成协议与服务契约，再做 CLI/MCP，最后做 App UI 和现场验收。不得以模型字段、关闭的 feature flag 或空 UI 提前宣称能力已实现。

## 6. 部分实现项落地实施计划（调研版）

### 6.1 调研结论与可实施性

当前 8 个“部分实现”条目均可以继续规划落地，但应按风险和外部依赖拆分，不能作为一个大提交同时关闭。R1 已完成并作为后续轨道的安全基线：

| 实施轨道 | 对应条目 | 可实施性 | 关键前置条件 | 关闭条件 |
|---|---|---|---|---|
| R1 Provider 安全与目录生命周期 | 6、7、16 子边界 | 已完成 | 跨平台 secret store、公开 DTO、一次性 plan | 第 6、7 项已关闭；第 16 项 Provider/CDP authority 子边界完成 |
| R2 Git 权威写操作保护 | 8 | 可立即实施，改动集中 | Repository fingerprint、统一 plan manager | 所有高风险 Git RPC 无法绕过 preview/confirm |
| R3 Daemon Fleet App 闭环 | 14 | 可实施，但需要新增多连接协调层 | host credential 临时读取、有限并发连接、generation 校验 | 实例聚合、isolate、rolling restart/update/rollback 在 App 可见可用 |
| R4 Usage、Quota 与 Metadata | 22、34 | 可实施，依赖 Provider 真实数据 | Provider usage normalizer、quota fetcher、metadata one-shot turn | 至少一个真实 Provider 形成 usage/quota/metadata 生产链，其他 Provider 准确降级 |
| R5 Voice 本地/远程双路径 | 21、33 | 源码闭环已完成，现场待验 | capture/recognition 解耦、远程音频播放、单一 Provider 选择、统一 cleanup | 真机确认本地无需 Bridge endpoint、远程 TTS 单次可播放并通过中断/权限/路由验收 |
| R6 Web UI 完整工作台 | 23B | 可实施，但属于独立前端里程碑 | 浏览器安全会话、terminal renderer、模块化状态层 | workspace、chat、terminal、Git/Diff、notification、settings/doctor 核心流程闭环 |
| R7 Browser Automation 收口 | 23D、16 剩余边界 | Bridge/CDP 与 Web 控制端源码已完成；R95 已固化平台 host adapter 注入/可用性/注册校验；平台 host/App 仍需单独现场轨道 | action 级 capability、CDP drag、visible/enabled/stable、已完成的 CDP 目标验证、Web 全量控制、受支持平台 host | manager/host 能力一致，Web 完整控制，App/不支持平台准确报告 unavailable |

调研发现的直接证据：

1. R1 已将 Provider profile schema 升级为公开配置 + secret 引用，目录 state 升级为 ownership/generation 模型，并为 install/rollback/remove 建立一次性 plan；CDP debugger URL 已与 base authority 二次绑定。
2. `workspace-service.js` 的高风险 discard、pull、push、stash、merge 已由统一 Git plan manager 和 server handler 校验一次性 planId、repository snapshot 与 confirm，直接绕过 plan 的 RPC 会返回结构化失败。
3. R3 已补充短连接 Fleet pool、Agent Home 实例列表/rolling/isolate 链、coordinator/connection pool 测试注册，并将 Bridge feature flag 拆分为 `daemonFleetOrchestration=false` 与 `daemonFleetTarget=true`；剩余是多平台和多 Bridge 现场验证。
4. server 已能消费 `event.payload.usage`；Codex App Server adapter 已产生规范化 turn usage，并实现独立 `generateMetadata()`。Provider Usage service 已提供按需 quota DTO；App 已解析 Provider descriptor 的 `metadataGeneration` 并与 Bridge flag 联合门控。真实 endpoint/凭证和其他 Provider producer 仍待现场验证。
5. App 的 `supportsVoice()` 已拆分本地 audio capture 与 Bridge remote STT/TTS capability；TTS 选择单一路径，parser/result 将 Bridge `audioBase64` 交给 NGF media 播放层。剩余风险是设备路由、系统中断和真实 Provider 服务现场验证。
6. Web UI 已改用 workspace registry list/create/import/open/archive/select，workspace registry 写操作统一 preview/confirm 且 archive 只改元数据、旧 Bridge import 缺失时回退 create；同时接入 `terminalBinaryFrames`/`terminalActivity` gate、V2 terminal subscribe/restore/output/input/resize/backpressure、workspace files/download、Git write plan gate、结构化 Git/Diff summary/files/unified 与分页缓存、notification read/action、八组 settings/doctor、compatibility/remediation、diagnostics JSON/text export、BroadcastChannel 多标签源码协调和 HttpOnly session 恢复；GitHub OAuth/account/binding/PR/checks/watch/attachment 工作台也已接线并通过独立 smoke，剩余风险集中在多标签/旧 Bridge/长流和真实浏览器现场。
7. Browser manager/CDP host 已支持 drag，并由 action capability gate 和元素可操作性检查保护；远程 target authority 已由 R1 收口，剩余风险集中在平台 host 与完整控制面。

### 6.2 R1：Provider 安全、目录生命周期与 CDP authority（已完成）

对应条目：6、7，以及第 16 项的 Provider/CDP authority 子边界。第 6、7 项已关闭；第 16 项的 Browser action/drag 子边界已完成，整体仍由受支持平台 host 和完整控制面现场轨道决定。

主要代码范围：

- `tools/agent-bridge/src/provider-directory-manager.js`
- `tools/agent-bridge/src/daemon-store.js`
- `tools/agent-bridge/src/provider-profile-service.js`
- `tools/agent-bridge/src/server.js`
- `tools/agent-bridge/src/provider-registry.js`
- `tools/agent-bridge/src/provider-secret-store.js`
- `tools/agent-bridge/src/browser-cdp-host.js`
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`

完成事实：

1. `ProviderSecretStore` 使用独立 service/alias namespace；Windows CurrentUser DPAPI 已实测，secret 通过 stdin 进入保护进程，不进入命令参数、日志或普通 JSON。
2. Provider profile schema v2 使用公开配置与 secret 引用分离结构；`envMutations` 支持 keep/set/remove，旧明文 env 提供幂等迁移和安全存储不可用降级。
3. list/status/test/doctor/CLI/MCP 只返回公开 DTO 与安全存储状态；runtime test 在 Bridge 内解析 secret/process environment，并对 stdout/stderr 和诊断文本脱敏。
4. Provider directory state v2 只保存受管 ownership、current/previous version、相对 entryPath、digest、健康状态和 generation，不嵌入完整 profile/env。
5. install/rollback/remove 使用安全随机、短 TTL、一次性 plan，并绑定 provider/profile、state generation/digest、版本、manifest/package/directory digest、平台和架构。
6. rollback 通过 state 重建入口，执行 realpath、ownership、directory digest 和 runtime test；activation、rollback 或 state 写入失败会恢复原 profile/runtime/state。
7. remove 先从 manager state 反查 ownership；普通 profile、state 外目录和符号链接逃逸返回稳定失败类别，不删除磁盘内容。
8. Bridge 启动执行离线 reconcile，检查 active/previous entry、profile ownership、secret/environment 引用、digest 和 runtime；异常只标记 degraded，不联网自愈。
9. `validateDebuggerWebSocketUrl(baseEndpoint, debuggerUrl, allowRemote)` 在 `/json/list` target 建连前拒绝 embedded credential、非 ws/wss、fragment、HTTPS → WS 降级、host/port 改写和网络范围跳转。
10. `serverInfo` 分别暴露 remote Provider directory 与 `providerSecretStorage` 状态，App 可在旧 Bridge 或安全存储降级时安全隐藏或提示。

本次验证：

- Provider profile security 覆盖明文迁移、安全存储不可用、公开 DTO、keep/set/remove、doctor/diagnostics、CLI/MCP 和日志泄漏扫描。
- Provider directory lifecycle 覆盖普通 profile、state 外目录、symlink、重复/过期/重启 plan、rollback runtime 失败、activation/state 恢复、启动 reconcile 和清理 warning。
- Browser CDP 覆盖 ws/wss、host/port 改写、凭证 URL、私网跳转、HTTPS 降级和真实恶意 `/json/list` target。
- 2026-07-30 Bridge 全量 `npm --prefix tools/agent-bridge run check` 退出码 0；SDK 23 HAP 构建 `BUILD SUCCESSFUL in 38 s 798 ms`，无新增 ArkTS 阻断错误。
- 第 6、7 项已关闭；第 16 项的 Browser action/drag/Web 控制端子边界已由 R7 源码完成，整体仍需平台 host、HarmonyOS App 全量动作与恶意页面/登录态现场证据。

### 6.3 R2：Git 高风险操作统一 Preview / Confirm

对应条目：8。

主要代码范围：

- `tools/agent-bridge/src/workspace-service.js`
- 新增 `tools/agent-bridge/src/workspace-git-plan-manager.js`
- `tools/agent-bridge/src/server.js`
- `tools/agent-bridge/src/protocol.js`
- `tools/agent-bridge/src/desktop-launcher.js`
- `tools/agent-bridge/src/mcp-host.js`
- `entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets`
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`

实施步骤：

1. 建立一次性 Git plan manager，plan 绑定 workspaceId、repository realpath、当前 HEAD、branch/upstream、index/worktree fingerprint、请求摘要、目标 ref/path 和有效期。
2. 首批强制保护 discard、force push、merge、stash drop/pop、branch delete，以及可能覆盖/合并本地状态的 pull。Stage/unstage/普通 commit 保持现有交互，但继续受 workspace root 和结果反馈约束。
3. Preview 使用只读 Git 查询生成 affected paths、untracked clean 预览、ahead/behind、目标 ref、冲突可能性、force/overwrite 风险和将执行的标准化参数；不得修改 worktree 或 index。
4. Confirm 时重新计算 fingerprint 并消费 plan。HEAD、index、worktree、upstream 或请求参数任一变化均返回 `git_plan_stale`。
5. server handler 只调用统一的 preview/confirm 执行入口，CLI、MCP、App 不得再直接调用底层 destructive method。
6. MCP destructive annotations 与 CLI help 同步标明本地写入/远端写入风险；非交互 CLI 缺 planId/confirm 时以非零退出码终止。
7. App 统一展示 paths、branch/ref、remote、ahead/behind、冲突/覆盖风险和 plan 过期提示，成功后只刷新当前 workspace Git scope。

验证与关闭门槛：

- 覆盖 preview 零写入、HEAD/index/worktree/upstream 变化、重复 confirm、路径穿越、untracked discard、force-with-lease、merge conflict、stash ref 和远端认证失败。
- 扩展 workspace Git、protocol alignment、CLI live、MCP live 和 App parser 测试。
- 直接向 Bridge 发送不带 planId 的高风险 RPC 必须失败；满足后第 8 项可关闭。

### 6.4 R3：Daemon Fleet 多实例管理可见闭环（源码已完成，现场待验）

对应条目：14。

主要代码范围：

- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetConnectionPool.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeModels.ets`
- `entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- `entry/src/test/AgentHomeDaemonFleetCoordinator.test.ets`
- `entry/src/test/List.test.ets`
- `tools/agent-bridge/src/server.js`

已完成的源码步骤：

1. Fleet connection pool 为每个 host profile 建立短生命周期独立 client；凭证按需从安全存储读取，只保留连接所需时间，不复制到 fleet state 或日志。
2. 以有限并发和独立超时调用每个 host 的 `daemon.instance.status`，生成 `hostProfileId + instanceId + generation` 快照。旧 Bridge 缺 instanceId 时只读展示为 incompatible，不进入 rolling target。
3. Daemon 设置区通过 `AgentHomeDaemonFleetSummary` 展示实例总数、健康/Bridge/configVersion 分布、告警实例数、缺失 heartbeat 数和每个实例的最近 heartbeat；单实例不可达不影响其他结果。
4. isolate/re-enable 作为 App 本地 rolling 排除状态，不停止远端 daemon、不删除 host profile、不撤销凭证。
5. Rolling preview 固定目标顺序、操作类型和预期 generation。执行 restart/update/rollback 后等待重连、generation 增长和健康验证；首错停止并返回 completed/failed/pending。
6. host lifecycle epoch、页面离开和 `stop()` 关闭对应连接并中止未开始步骤；App 重启不会自动继续未完成 rolling。
7. Bridge 发布 `daemonFleetOrchestration=false` 与 `daemonFleetTarget=true`，App 自身是否支持 Fleet 由本地构建和 capability gate 决定。
8. Fleet coordinator/connection pool 测试已注册到 `List.test.ets`；SDK 23 HAP 与 Bridge 全量 check 已通过。
9. R19 新增 `daemon-target-guard`，Bridge restart/update/rollback handler 与 App preview/执行/轮询统一校验 `hostProfileId`、`expectedInstanceId` 和 `expectedGeneration`；目标不再匹配时返回结构化失败并阻断写操作。target guard smoke 已加入 Bridge 全量 check。
10. R91 新增 `summarizeDaemonFleetResults()` 与强类型版本分布，旧 Bridge/不可达结果只读计入摘要，不进入 rolling target；`AgentHomeDaemonFleetConnectionPool.test.ets` 覆盖健康计数、版本分布、告警和缺失 heartbeat，资源与 App 页面通过 i18n 接线。

剩余验证与关闭门槛：

- 完成并执行全部成功、首实例失败、中途失败、不可达、旧 Bridge、generation 不增长、版本不匹配、isolate、用户取消、host 删除和 App 重启中断的 Fleet 定向自动化；R19 已补齐目标实例变化、generation 不增长和首错停止测试。
- 使用两个临时 Bridge 完成 A/B 实例聚合与 rolling smoke；跨 Windows/Linux/macOS 更新、自启重启和权限路径继续作为现场验收。
- 现场失败只重开对应子步骤；在自动化和现场证据齐全前，第 14 项保持“部分实现”。

### 6.5 R4：真实 Usage / Quota / Metadata 生产链

对应条目：22、34。

主要代码范围：

- `tools/agent-bridge/src/agent-experience-manager.js`
- 新增 `tools/agent-bridge/src/provider-usage-service.js`
- Provider adapter：`codex-app-server-provider.js`、`opencode-provider.js`，再按能力扩展其他 Provider
- `tools/agent-bridge/src/server.js`
- `tools/agent-bridge/src/provider-catalog.js`
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`

实施步骤：

1. 将“单次 turn token/cost”与“Provider 套餐 quota”拆成两个数据源。Turn usage 继续随 Provider event 进入 `usageManager.record()`；套餐 quota 采用 Paseo 的按需 fetcher 模式，只在 Usage 页面可见或用户刷新时请求，不建立永久后台轮询。
2. 定义 Provider-agnostic quota 结果：providerId、status、planLabel、windows、balances、details、source、fetchedAt、expiresAt。新增可选 `provider.usage.list` RPC 和 `providerUsage` feature flag。
3. 先为 Codex App Server 接入 `thread/tokenUsage/updated`，参考 Paseo 的 `toAgentUsage()` 兼容 snake_case/camelCase token 字段，并把 latest usage 附加到对应 turn completion；没有字段时保持 unavailable。OpenCode 已按实际 `step-finish` 与 `compaction` part 接入第二个 Provider，Gateway 已按 Responses/Studio completion 接入 usage，并由定向 smoke 锁定 token/cost、compaction 或字段缺失和重复事件语义。
4. 套餐 quota fetcher 继续采用按需读取现有授权的模式，同时允许每个 Provider 声明 `usageEndpoint` 或 `usageEndpointEnv`；endpoint 和重定向目标只接受 HTTPS，凭证只通过 `usageEndpointTokenEnv` 环境变量读取，限制响应大小、超时和重定向次数。首版不自行刷新或重写 Provider 凭证；401/403、缺凭证或响应变化均返回 unavailable，token 不进入 usage store、RPC 或日志。`AGENT_BRIDGE_CODEX_USAGE_URL` 保持旧兼容路径。
5. Provider 接口增加可选 `generateMetadata(payload)`。首版为 Codex App Server 实现独立临时 thread/turn，Bridge 先校验 session、agent、provider、providerSession、workspace 与连接 host scope，再只发送 kind、用户目标、受限 timeline 摘要、Git/Diff 摘要和已绑定 workspace；结果使用严格 JSON/长度/branch-name 校验，完成后清理临时 session，不写主 timeline。旧 session 缺少关联字段时只返回 warning，不把原始请求 payload 直接下传。
6. sessionTitle、branchName、commitMessage、pullRequest 保持 preview/edit；应用继续转交 session/Git/GitHub 既有 API，metadata Provider 不直接写工作区。
7. `usageEvents`、`providerUsage`、`metadataGeneration` 改为 Provider/session 真实 capability。全局 serverInfo 只表明协议支持，页面再按当前 Provider capability 决定入口是否可用。
8. Usage UI 明确区分 unsupported、available-empty、loading、failed 和 stale；actual/estimated、多币种、quota window、resetAt 和 compaction 继续分组显示。

验证与关闭门槛：

- 使用录制的真实 Provider fixture 覆盖 usage 字段缺失、重复事件、cache/reasoning、compaction、多币种、quota reset、限流和 credential 不可用。
- Metadata 覆盖四种 kind、结构化输出失败、超时、取消、临时 session 清理、主 timeline 零污染和 Git 状态变化。
- 至少一个真实 Provider 的 turn usage、quota 和四类 metadata 可用；其他 Provider 正确 capability 降级后，第 22、34 项可关闭。

### 6.6 R5：Voice 本地与远程能力解耦

对应条目：21、33。

主要代码范围：

- `ngf_framework/src/main/ets/media/contracts/IVoicePlatform.ets`
- `ngf_framework/src/main/ets/media/facades/VoicePlatformFacade.ets`
- 新增或复用 NGF media 音频播放 facade
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- `tools/agent-bridge/src/voice-manager.js`
- `docs/agent-bridge-voice.md`

实施步骤：

1. SDK 23 AudioRenderer/AVPlayer 内存播放、AudioSession 和中断 API 已按 `docs/agent-bridge-voice.md` 核对，平台调用集中在 NGF media 层。
2. capture、device recognition、remote upload 已拆开，录音 mode 为 `device_stt`、`remote_stt` 或 `capture_only`；本地 STT 不创建 Bridge session，远程 STT 不启动 CoreSpeechKit recognition。
3. capability 已拆为 capture/playback、device/remote STT/TTS、activity events 和 interruption；旧 `voice` flag 保留兼容汇总。
4. App 在每次录音/TTS 开始前选择并固定唯一实际可用来源，过程中不静默切换；远程 TTS 音频经 NGF media 播放。
5. Bridge TTS 结果包含 `audioBase64`、MIME、采样率、声道、采样位宽和时长边界；完成、停止、中断、页面离开和后台均清理 buffer/资源。
6. `toggleVoiceSpeech()` 只调用选定的本地或远程 TTS，stop 只终止对应 request，并保持 AudioSession 状态一致。
7. partial/final transcript 只接受当前会话权威来源；晚到、旧 session、sequence 回退或另一 Provider 结果被丢弃。

验证与关闭门槛：

- 自动化已覆盖协议/Voice manager、能力字段、远程音频结果解析、单一 Provider 选择、取消和清理；Bridge 全量 check 与 SDK 23 构建已通过。
- 仍需真机验证噪声、长录音、前后台、耳机/蓝牙、来电、弱网和 TTS 打断，并用真实 Provider 确认远程音频输出。
- 完成现场门后再将第 21、33 项从“部分实现”更新为“已实现”。

### 6.7 R6：Web UI 完整工作台

对应条目：23B。

主要代码范围：

- `tools/agent-bridge/src/web/index.html`
- `tools/agent-bridge/src/web/app.js`，实施时拆分为 protocol/state/views/terminal/diff 等小模块
- `tools/agent-bridge/src/server.js`
- `tools/agent-bridge/scripts/check-web-ui-contract-smoke.js`
- `tools/agent-bridge/scripts/check-web-ui-live-smoke.js`

实施步骤：

1. 保持同源 Bridge 后端，不新增平行 API；当前单文件脚本已按协议 client、host/session state、workspace、terminal、Git/Diff、notification 和 settings/doctor 责任组织。
2. `/web/auth/session` 已在 bearer 首次验证后签发 host/origin 绑定的 HttpOnly、SameSite=Strict Web session；页面刷新通过 cookie 换取新 WebSocket ticket，token 不写 localStorage/sessionStorage。
3. Workspace 区已改用 registry list/create/select，不再从 Agent cwd 推导；import/open/archive 和多标签协调仍待补。
4. Terminal 已使用 `terminalBinaryFrames`/`terminalActivity` gate，完成 list/capture/create/close，并在 V2 capability 下完成 subscribe/restore、binary output、input、resize、512 KiB 限制、`bufferedAmount` 背压提示和断线后的重新订阅；HarmonyOS renderer/长流现场仍待验。
5. Git/Diff 已使用结构化 changes/diff API，完成文件状态、增删摘要、summary/files/unified 视图、文件/行 cursor 分页和当前文件缓存；Web 已补 stage/unstage/commit/pull/push/branch/stash/merge/discard，其中 discard/pull、branch delete、stash pop/drop 和 merge 复用 R2 planId preview/confirm；GitHub 工作台和 Browser Web 控制面也已形成 RPC 闭环，真实远端/浏览器现场仍待验。
6. Workspace 文件区已消费 `workspace.files.list`、`workspace.file.get` 和一次性 `workspace.file.download`，对相对路径、预览大小和同源下载 URL 做边界校验；Notification 已支持 unread/read、route/action；settings/doctor 已消费 `daemon.status`、`daemon.health`、`workspace.registry.doctor` 和脱敏 `diagnostics.export`，规范化八组状态、兼容结果和受控 remediation actionId，并支持 JSON/text 导出；GitHub/Browser Web 工作台源码已补齐，旧 Bridge、多标签、长流和现场仍待验。
7. Refresh 已按 agent/session/workspace/terminal/notification/browser 分类更新；当前 scope 的终端 binary 与多标签现场仍需独立验证。
8. Browser 与 Service Proxy 区继续消费现有 RPC；Web Browser 区已补 loading/error/confirm、host/instance/page 生命周期、导航、日志、等待、下载、permission、完整动作和 capability 降级，HarmonyOS App 仍保留基础入口并按缺失能力降级。
9. 所有动态文本使用 `textContent`/DOM API，保持 CSP 无 inline script、恶意链接策略、noopener/noreferrer 和 Host/Origin 校验。

验证与关闭门槛：

- 合约测试覆盖正确 feature key、HttpOnly session、无 token 持久化、CSP、DOM 安全、workspace registry list/create/import/open/archive 的 preview/confirm 与 busy guard、session.messages、terminal binary subscribe/restore/input/resize/backpressure、workspace files/download、Git write preview/confirm、结构化 diff 分页、notification read/action、diagnostics export、GitHub workflow 和 Browser instance/page/action capability/path 控件。
- Live smoke 已覆盖 cookie 刷新认证恢复、Origin 校验、logout、daemon status/health、workspace doctor、八组 diagnostics export、Web GitHub 工作台和 Browser manager/CDP 控制链；多标签页、旧 Bridge、workspace CRUD、chat 重连、长 terminal、真实 GitHub/Browser host 和现场上传下载仍待扩展。
- Web contract/live 已接入 `precheck`/`npm run check` 生命周期；Browser 控制面源码已完成，但多标签、旧 Bridge、长 terminal、HarmonyOS App 全量动作和真实浏览器现场通过后，第 23B 项才能关闭。

### 6.8 R7：Browser Automation 能力与平台 Host 收口

对应条目：23D，并完成第 16 项剩余 Browser 安全边界。

主要代码范围：

- `tools/agent-bridge/src/browser-automation-manager.js`
- `tools/agent-bridge/src/browser-platform-host.js`
- `tools/agent-bridge/src/browser-cdp-host.js`
- `tools/agent-bridge/src/mcp-host.js`
- `tools/agent-bridge/src/web/`
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- NGF `webBridge`/platformOhos 层的受支持 HarmonyOS host（需官方 API 复核后决定）

实施步骤：

1. 保持现有零依赖 Chromium CDP host 作为 Node/desktop 的真实 adapter；HarmonyOS/普通 Web 只注册平台真实支持的能力，不按平台名称猜测，也不新增虚假的 Electron capability。R95 通过 `browser-platform-host.js` 固化平台 adapter 注入、可用性和注册校验，默认适配器不可用时返回 `browser_platform_host_unavailable`。
2. Web 已补 navigate/back/forward/reload、snapshot、screenshot、console/network logs、wait、全部 action、download list、instance/page close 和 permission 管理；敏感输入由 Bridge plan 只显示目标与风险，不回显正文。HarmonyOS App 后续仍需复用同一 parser/client 补齐全量动作。
3. 在真实 desktop/platform host 上验证 visible/enabled/stable、跨域、恶意页面、登录态、真实上传下载和 host 清理；当前 Bridge/CDP smoke 已覆盖这些边界的可自动化部分。
6. 当前仓库没有 Electron 页面宿主，不新增虚假的 Electron capability。Node/desktop 以 CDP host 为真实宿主；HarmonyOS 只有在官方 Web 组件 API 能满足真实输入、隔离和清理要求时才注册本地 host，否则明确显示 unavailable；普通 Web UI 已是完整控制端，但仍不宣称浏览器宿主。
7. Host 断线、workspace/agent archive、页面关闭和 daemon shutdown 统一清理 pending command、refs、downloads 和实例映射；外部 Chromium 进程除非明确受管，不被 Bridge 隐式终止。
8. MCP 继续将 snapshot/logs/list 标为只读，navigate/open-world 与输入/上传/下载/evaluate/close 使用准确风险 metadata 和一次性 confirm。
9. R20 已将 HarmonyOS App Browser action 的完整 payload 保存为 Preview 快照，Confirm 只消费该快照和一次性 planId；取消、断线、host 切换和页面清理会丢弃未确认快照。

验证与关闭门槛：

- 覆盖 drag、visible/enabled/stable、stale ref、弹窗、跨域、恶意页面、登录态、上传/下载、敏感输入遮蔽、host 断线和实例清理。
- 覆盖远程 CDP 协议/host/port/credential/私网边界，并验证 action capability 不匹配时 manager 在 dispatch 前拒绝。
- Web 可见操作已形成源码闭环；还需至少一个真实 desktop host、HarmonyOS 按真实 capability 注册或准确降级、App 全量动作及真实上传下载/恶意页面现场后，第 23D 和第 16 项才可关闭。R20 只关闭 App Preview/Confirm 目标快照源码子阶段。

### 6.9 里程碑顺序与共同验收

建议严格按 `R1 -> R2 -> R3 -> R4 -> R5 -> R6 -> R7` 串行关闭源码节点。R4 与 R5 可在人员充足时并行，但 feature flag 和 App 状态模型必须分别验收。现场验收可以与后续源码开发并行，不得反向跳过自动化门槛。

每个轨道必须完成：

1. RequestType/EventType、server handler、CLI/MCP、App request/parser 和 feature flag 对齐；新增字段保持 optional，旧客户端缺字段时安全降级。
2. 高风险操作使用随机、短期、一次性 plan；preview 零写入，confirm 校验状态摘要并返回 failureCategory、remediation、warnings 和审计记录。
3. 持久化提供 schemaVersion、幂等迁移、损坏数据降级和原子写入；敏感值不进入普通 JSON、日志、doctor、通知或 UI。
4. 定向 smoke 先通过，再执行 Bridge 全量 `npm --prefix tools/agent-bridge run check`。只有实际进入 npm lifecycle 的脚本才可记录为全量 check 证据。
5. 涉及 ArkTS 修改时执行静态 ArkTS 规则复核；仅在里程碑关闭验收时执行 SDK 23 `assembleHap --no-daemon --stacktrace`。
6. 每个轨道完成后更新本清单的当前事实、实现状态、验证状态和证据路径；不批量提前关闭依赖条目。

## 7. 交付与验收规则

- Bridge 新能力：协议常量、server handler、持久化/运行时、CLI/MCP/App 消费者按实际范围接入，并提供针对性 smoke。
- App 新能力：模型解析、client 请求、响应/事件处理、响应式状态、UI、持久化、i18n 和生命周期清理完整闭环。
- 高风险操作：默认 preview/dry-run，显式 confirm 后执行，返回结构化 failureCategory 和 remediation。
- 现场依赖：真机、AGC、GitHub、远程 Provider、跨平台升级和 Relay 环境单独记录验证状态，不反向篡改源码实现状态。各“部分实现”条目的现场验收步骤、前置条件与通过标准见 `docs/agent-bridge-field-acceptance-checklist.md`；现场通过前条目一律保持“部分实现”，不允许以 mock/live smoke 替代。
- 历史测试记录：只能表述为“曾通过”；当前结论要写“本次已执行”必须附本次命令、日期和结果。

## 8. 主要证据索引

Bridge：

- `tools/agent-bridge/src/server.js`
- `tools/agent-bridge/src/protocol.js`
- `tools/agent-bridge/src/provider-catalog.js`
- `tools/agent-bridge/src/provider-directory-manager.js`
- `tools/agent-bridge/src/provider-registry.js`
- `tools/agent-bridge/src/providers/`
- `tools/agent-bridge/src/agent-manager.js`
- `tools/agent-bridge/src/agent-fork-coordinator.js`
- `tools/agent-bridge/src/agent-lifecycle-coordinator.js`
- `tools/agent-bridge/src/agent-experience-manager.js`
- `tools/agent-bridge/src/diagnostics.js`
- `tools/agent-bridge/src/file-checkpoint-store.js`
- `tools/agent-bridge/src/terminal-manager.js`
- `tools/agent-bridge/src/workspace-registry.js`
- `tools/agent-bridge/src/workspace-service.js`
- `tools/agent-bridge/src/github-client.js`
- `tools/agent-bridge/src/github-credential-store.js`
- `tools/agent-bridge/src/mcp-host.js`
- `tools/agent-bridge/src/mcp-stdio-server.js`
- `tools/agent-bridge/src/notification-manager.js`
- `tools/agent-bridge/src/push-notification-manager.js`
- `tools/agent-bridge/src/daemon-supervisor.js`
- `tools/agent-bridge/src/autostart-manager.js`
- `tools/agent-bridge/src/daemon-update-manager.js`
- `tools/agent-bridge/src/daemon-remote-config-manager.js`
- `tools/agent-bridge/src/auth.js`
- `tools/agent-bridge/src/security-audit.js`
- `tools/agent-bridge/src/relay-crypto.js`
- `tools/agent-bridge/src/relay-identity-store.js`
- `tools/agent-bridge/src/websocket-client.js`
- `tools/agent-bridge/src/relay-server.js`
- `tools/agent-bridge/src/relay-manager.js`
- `tools/agent-bridge/src/schedule-manager.js`
- `tools/agent-bridge/src/loop-manager.js`
- `tools/agent-bridge/src/chat-room-manager.js`
- `tools/agent-bridge/src/voice-manager.js`
- `tools/agent-bridge/src/service-manager.js`
- `tools/agent-bridge/src/service-proxy-router.js`
- `tools/agent-bridge/src/service-access-ticket-manager.js`
- `tools/agent-bridge/src/browser-automation-manager.js`
- `tools/agent-bridge/src/browser-cdp-host.js`
- `tools/agent-bridge/src/web/`
- `tools/agent-bridge/src/desktop-launcher.js`
- `tools/agent-bridge/docker/Dockerfile`
- `tools/agent-bridge/docker/compose.example.yml`
- `tools/agent-bridge/scripts/check-provider-directory-smoke.js`
- `tools/agent-bridge/scripts/check-daemon-remote-config-smoke.js`
- `tools/agent-bridge/scripts/check-schedule-manager-smoke.js`
- `tools/agent-bridge/scripts/check-loop-manager-smoke.js`
- `tools/agent-bridge/scripts/check-chat-room-manager-smoke.js`
- `tools/agent-bridge/scripts/check-voice-manager-smoke.js`
- `tools/agent-bridge/scripts/check-service-proxy-smoke.js`
- `tools/agent-bridge/scripts/check-browser-automation-manager-smoke.js`
- `tools/agent-bridge/scripts/check-browser-cdp-host-smoke.js`
- `tools/agent-bridge/scripts/check-docker-contract-smoke.js`
- `tools/agent-bridge/scripts/check-web-ui-contract-smoke.js`
- `tools/agent-bridge/scripts/check-relay-crypto-smoke.js`
- `tools/agent-bridge/scripts/check-relay-server-smoke.js`
- `tools/agent-bridge/scripts/check-relay-manager-smoke.js`
- `tools/agent-bridge/scripts/`

App：

- `entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets`
- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/features/agentBridge/AgentBridgeRelayPolicy.ets`
- `entry/src/main/ets/features/agentBridge/AgentBridgeTerminalRenderer.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeModels.ets`
- `entry/src/main/ets/features/agentHome/AgentHomePersistenceRepository.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeHostCredentialStore.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeHostSwitchCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeRichContentLinkPolicy.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeRichContentPolicy.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeMessageForkPolicy.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeRelayUiPolicy.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeDiagnosticsActionPolicy.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeWorkbenchCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeCommandRegistry.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeVisibleScopeCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeSessionWindowCoordinator.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeSessionWindowController.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetConnectionPool.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentSessionWindowPage.ets`
- `entry/src/test/AgentBridgeM5Parser.test.ets`
- `entry/src/test/AgentBridgeM7Parser.test.ets`
- `entry/src/test/AgentBridgeVoiceParser.test.ets`
- `entry/src/test/AgentBridgeServiceProxyParser.test.ets`
- `entry/src/test/AgentBridgeBrowserParser.test.ets`
- `entry/src/test/AgentHomeM5Policy.test.ets`
- `entry/src/test/AgentHomeDaemonFleetCoordinator.test.ets`
- `entry/src/test/AgentHomeDaemonFleetConnectionPool.test.ets`
- `entry/src/test/AgentHomeWorkbenchCoordinator.test.ets`
- `entry/src/test/AgentHomeCommandRegistry.test.ets`
- `entry/src/test/AgentHomeVisibleScopeCoordinator.test.ets`
- `entry/src/test/AgentHomeSessionWindowCoordinator.test.ets`
- `entry/src/test/RelayAgentBridgeParser.test.ets`
- `entry/src/test/RelayEnvelopePolicy.test.ets`
- `entry/src/test/AgentHomeRelayUiPolicy.test.ets`
- `entry/src/test/List.test.ets`
- `entry/src/main/ets/entryability/EntryAbility.ets`
- `ngf_framework/src/main/ets/security/facades/RelayCryptoFacade.ets`
- `ngf_framework/src/main/ets/media/contracts/IVoicePlatform.ets`
- `ngf_framework/src/main/ets/media/facades/VoicePlatformFacade.ets`
- `ngf_framework/src/main/ets/push/`
- `ngf_framework/src/main/ets/systemTasks/`

安全与架构文档：

- `docs/agent-bridge-docker.md`
- `docs/agent-bridge-relay-threat-model.md`
- `docs/agent-bridge-r3-progress.md`
- `docs/agent-bridge-voice.md`
- `docs/agent-bridge-r33-voice-session-state-progress.md`
- `docs/agent-bridge-architecture.md`
- `tools/agent-bridge/README.md`

Paseo 参考：

- `paseo/docs/architecture.md`
- `paseo/docs/agent-lifecycle.md`
- `paseo/docs/providers.md`
- `paseo/docs/custom-providers.md`
- `paseo/public-docs/cli.md`
- `paseo/public-docs/worktrees.md`
- `paseo/public-docs/mcp.md`
- `paseo/public-docs/schedules.md`
- `paseo/public-docs/voice.md`
- `paseo/public-docs/browser.md`
- `paseo/public-docs/docker.md`
- `paseo/public-docs/web-ui.md`
- `paseo/public-docs/security.md`
- `paseo/public-docs/metadata-generation.md`
- `paseo/packages/server/src/services/quota-fetcher/providers/codex.ts`
- `paseo/packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `paseo/packages/server/src/server/agent/structured-generation-providers.ts`

### R16 Browser host result integrity 证据

- `tools/agent-bridge/src/browser-automation-manager.js` 在 `handleHostResult()` 中重新组装 host result 信封，过滤权威字段、失败/告警字段及 `__proto__`、`constructor`、`prototype` 顶层键。
- Browser upload preview/confirm 绑定 realpath、文件大小、mtime 和 SHA-256，默认单文件 64 MiB、总计 128 MiB；文件变化或超限时拒绝 confirm。
- `tools/agent-bridge/scripts/check-browser-automation-manager-smoke.js` 覆盖伪造信封字段、原型污染键、一次性 pending 消费和重复结果。
- 2026-08-08 本轮实际执行 `npm run check:browser`、`npm run check` 和 `git diff --check` 均通过；第 16、23D 的平台 host、HarmonyOS App 全量动作和真实浏览器现场仍待 FIELD。

### R17 Remote config URL integrity 证据

- `tools/agent-bridge/src/daemon-remote-config-manager.js` 的 `normalizeRemoteConfigUrl()` 统一拒绝 HTTP、嵌入凭证、fragment、控制字符和无效 host；fetch 与默认下载器共用校验，重定向不会绕过边界。
- `tools/agent-bridge/scripts/check-daemon-remote-config-smoke.js` 覆盖合法 HTTPS、HTTP、嵌入凭证和 fragment；2026-08-08 本轮 `npm run check` 退出码为 0。
- 第 14 项仍因跨平台安装、自启重启、rolling 和真实签名配置现场保持“部分实现”。

### R73 Daemon public surface 证据

- `tools/agent-bridge/src/server.js` 为 daemon `status`/`health`/`logs` 公开结果保留兼容字段但固定返回 `.agent-bridge/config.json` 与 `.agent-bridge/logs/daemon.log` marker；内部日志读取继续使用 `daemonStore.paths.daemonLog`。
- `publicManagedProcessRecords()` 仅保留 id、providerId、kind、pid、alive、受控 owner 摘要和生命周期时间，移除 `command`、`args`、`cwd` 与完整 `identity`。
- `tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js` 预置含绝对路径和敏感参数的 ledger 记录，启动临时 Bridge，验证 `daemon.health`、`daemon.status`、`daemon.logs` 三类 RPC 的公开字段不包含临时 Bridge home、命令行参数或工作目录；`node --check`、该 smoke、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check` 本轮均退出码 0。
- R73 为 Node/Bridge-only 修改，未修改 ArkTS/HAP，未安装、启动或测试设备。第 14 项跨平台 daemon/rolling 与第 16 项 Browser host/真机安全边界仍按 FIELD 验收。

### R74 Daemon update public surface 证据

- `publicDaemonUpdateStatus()` 统一用于 daemon `status`/`health` 的 `update` 和独立 `daemon.update.status`，递归移除 saved update state 中的 path/cwd/command/args/environment/credential 字段。
- `statePath`、`stagedPath`、`backupPath` 和 development root 只返回 `.agent-bridge/runtime/...` 或 `.agent-bridge/development` marker；内部更新器仍使用真实路径进行校验、原子写入和回滚。
- public-surface smoke 预置私有 update state，验证嵌套和独立结果不包含临时 Bridge home；`node --check`、public-surface smoke、daemon supervisor live smoke、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check` 本轮均退出码 0。本阶段未修改 ArkTS/HAP、未安装设备。

### R19 Fleet target integrity 证据

- `tools/agent-bridge/src/daemon-target-guard.js` 提供统一的 host/instance/generation 校验；`tools/agent-bridge/src/server.js` 的 daemon restart/update/rollback handler 在执行前调用该校验。
- `entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets`、`AgentBridgeModels.ets` 和 `AgentHomeDaemonFleetCoordinator.ets` 保留可选目标字段，并在 App preview、执行、轮询和结果聚合中校验身份；Fleet isolate/re-enable 使用本地集合。
- `tools/agent-bridge/scripts/check-daemon-target-guard-smoke.js` 覆盖旧客户端兼容、匹配目标、实例变化、当前身份缺失、generation 过期/显式零值、host 不匹配和非法 generation。严格匹配加固后再次执行 target guard smoke、`npm --prefix tools/agent-bridge run check`，均退出码 0；本轮没有 ArkTS 变化，沿用同日已通过的 SDK 23 `assembleHap --no-daemon --stacktrace` 证据。
- HAP 构建后仅向 `5KLBB25A10203862` 执行安装尝试；HDC 返回 `9568423`（签名 profile 未授权 UDID），未启动或测试。第 14 项的双 Bridge、跨平台安装、自启重启和真实签名配置仍待 FIELD。

### R57 Daemon remote config WebSocket host scope 证据

- `tools/agent-bridge/src/server.js` 的 `daemonConfigPayloadForConnection()` 将当前连接 `clientHello.hostProfileId` 覆盖到 daemon config RPC payload；`tools/agent-bridge/src/daemon-remote-config-manager.js` 为 apply/rollback plan 保存并校验 host scope。
- Apply plan 继续绑定 `instanceId`、`generation`、`sourceUrl`、`configVersion` 和 `digest`；fetched 文档或来源 URL 变化后，旧 plan 返回 `plan_expired`。跨 host confirm 返回稳定 `host_scope_mismatch`，同 host confirm 保持原有 preview/confirm 语义。
- `tools/agent-bridge/scripts/check-daemon-remote-config-smoke.js` 覆盖 manager 级 host A/B、版本变化、source URL 变化和 rollback 隔离；新增 `tools/agent-bridge/scripts/check-daemon-remote-config-host-scope-live-smoke.js` 启动真实 Bridge 并建立两条 WebSocket 连接，验证进程级连接 scope。
- 本轮实际执行两个定向 smoke、Node 语法检查和 package JSON 解析，均退出码 0；`check:daemon-remote-config-host-scope-live` 已注册到 `postcheck`。本轮未修改 ArkTS/HAP、未构建或安装设备；第 14 项跨平台 daemon、真实签名配置和双 Bridge rolling 仍保持“部分实现”。

### R58 Daemon config CLI/MCP 证据

- `tools/agent-bridge/src/desktop-launcher.js` 将 `daemon config status/fetch/validate/preview/apply/rollback` 统一映射到 live `RequestType`；`liveManagementRpcForCli()` 在无运行 Bridge 时返回 `live_bridge_required`，不调用本地 remote-config manager。CLI 的结构化失败仍输出 `failureCategory`、`message` 和 `remediation`，并设置非零退出码。
- `tools/agent-bridge/src/mcp-host.js` 暴露六个 daemon config 工具；status/validate/preview 为 read-only，fetch 为 open-world，apply/rollback 为 destructive。`toolConfirmationFailure()` 在 apply/rollback 缺少 `confirm=true` 时阻断请求，MCP stdio 不触达 Bridge。
- 本轮实际执行 `node --check`（desktop launcher、MCP host、两份 live smoke）、`node scripts/check-management-cli-live-smoke.js` 和 `node scripts/check-mcp-live-smoke.js`，均退出码 0；随后 Bridge 全量 `check`（含 postcheck）和 `git diff --check` 通过。本轮未修改 ArkTS/HAP，未构建、未安装、未启动或测试设备；第 14 项现场门保持不变。

### R20 Browser action Preview/Confirm 快照证据

- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets` 的 `pendingBrowserActionPayload` 保存完整 action 目标；`browserActionConfirmPayload()` 显式复制预览快照，只替换一次性 `planId`/`confirm`，取消、断线和 host 切换由 `clearBrowserRequests()` 清除。
- `tools/agent-bridge/scripts/check-protocol-alignment-smoke.js` 已增加 App action snapshot/confirm reuse 源码断言。2026-08-08 本轮 protocol alignment、target guard、Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 均通过。
- HAP 产物为 `entry/build/default/outputs/default/entry-default-signed.hap`（20:21:39，14,207,075 bytes，SHA-256 `50A3C4FFC5CA23C74D05709D48D53241E577EE229036D08F3780CA1718C7661A`）。本轮未重复设备安装；第 16、23D 的真实 host、HarmonyOS 全量动作、恶意页面和上传/下载仍待 FIELD。

### R24 Voice 字段与 Provider 输出校验证据

- `tools/agent-bridge/src/voice-manager.js` 新增音频 MIME allowlist、采样 profile validator、语言/voiceId/transcript 长度与控制字符清理；录音和 TTS 不再静默夹断非法采样参数。
- STT 结果仅在 confidence/durationMs 为有效范围时返回对应字段；TTS 返回格式和 profile 必须通过同一校验，未知格式返回 `voice_tts_format_unsupported`，无效 profile 返回 `voice_tts_audio_profile_invalid`。
- `tools/agent-bridge/scripts/check-voice-manager-smoke.js` 覆盖非法字段、未知格式、异常 Provider 和错误文案脱敏；本轮已实际执行 `node --check src/voice-manager.js`、`node --check scripts/check-voice-manager-smoke.js` 和 `node scripts/check-voice-manager-smoke.js`，均退出码 0。
- R24 只关闭 Voice 字段验证源码子阶段；第 21、33 项仍等待真机权限/路由、真实 STT/TTS、弱网和长录音现场。

### R25 Usage / Metadata 结果完整性证据

- `tools/agent-bridge/src/provider-usage-service.js` 新增 `normalizeQuotaNumber()`；usage window 与 quota event 只接受非负有限安全整数，非法值保持字段缺失。
- `tools/agent-bridge/src/metadata-scope.js` 对显式未知 kind 返回 `metadata_kind_invalid`，并导出 `normalizeMetadataResult()` 限制 suggestion/alternative/warning 的控制字符、UTF-8 长度、去重和数量；`server.js` 统一消费该 normalizer 并用稳定文案处理 Provider 异常。
- `tools/agent-bridge/scripts/check-provider-usage-smoke.js`、`tools/agent-bridge/scripts/check-metadata-scope-smoke.js` 本轮实际执行并退出码 0；随后 Bridge 全量 `npm run check`（含 R12/R13/Voice platform postcheck）实际退出码 0。
- R25 只关闭 Provider 结果完整性源码子阶段；第 22、34 项仍等待真实 Provider quota/compaction/metadata、真机展示和现场数据。

### R26 Metadata request integrity 证据

- `tools/agent-bridge/src/server.js` 在 Provider turn 前建立 metadata request state，timeout 通过受控 race 结束请求；连接关闭会 detach 并清理 pending，迟到结果不会回写。
- `metadata.generate.cancel` 校验同一连接以及 `hostProfileId`、`sessionId`、`agentId` scope；重复请求/cancel 和控制响应路由都有稳定结果。
- `AgentBridgeModels.ets`、`AgentBridgeClient.ets`、`NGFAgentHomePage.ets`、`mcp-host.js` 和 `desktop-launcher.js` 已接 requestId/timeout/cancelled 状态；`check-metadata-request-smoke.js` 覆盖 timeout、cancel、duplicate 和 scope mismatch；`check-metadata-request-disconnect-smoke.js` 使用真实 `/ws` 覆盖主动断开、服务端 unregister、迟到 Provider 隔离和新连接复用 requestId。
- 2026-08-08 本轮实际执行 R26/R27 定向 smoke 与 `npm --prefix tools/agent-bridge run check`，均退出码 0；SDK 23 HAP 构建沿用 R26 当日证据，未因本轮 Node smoke 重复构建。指定设备 Offline，未安装、启动或测试。
- R26 只关闭 metadata request integrity 源码子阶段；第 22、34 项仍等待真实 Provider 和真机现场。

### R27 Metadata WebSocket disconnect cleanup 证据

- `check-metadata-request-disconnect-smoke.js` 真实连接 `/ws`，使用延迟 Mock Provider 发起 metadata 请求后主动 terminate；轮询 `daemon.status` 直到 `activeWebSocketConnections=0`，覆盖服务端 close 回调的异步时序。
- 旧连接 Provider turn 越过断开生命周期后，新连接复用原 `requestId` 并正常返回，证明迟到结果不会跨连接回写；R27 smoke 已由 `check:r27` 和全量 `postcheck` 实际执行并退出码 0。
- R27 只关闭真实 WebSocket disconnect cleanup 的源码自动化子阶段；第 22、34 项仍等待真实 Provider、长会话和真机现场。

### R28 Usage / Metadata live lifecycle 证据

- `tools/agent-bridge/scripts/check-usage-metadata-live-smoke.js` 通过真实 `/ws` 完成 hello/host scope、session create、budget set、message queue/send、异步 usage event 等待、summary/events 查询、四种 metadata、host 隔离和断线重连后的 usage/budget 读取；断言 actual `15` tokens、estimated `20` tokens、USD `0.15`、quota `90/100` 和 compaction `200→80`。
- `tools/agent-bridge/src/providers/mock-provider.js` 仅在 `AGENT_BRIDGE_MOCK_USAGE_EVENTS=1` 时注入可重复测试事件；默认环境不伪造 usage。`sendObservedEvent` 在 Provider 未提供 `agentId` 时从权威 session Agent 补齐，显式 Provider 值优先。
- 本轮实际执行 `node --check src/providers/mock-provider.js`、`node --check scripts/check-usage-metadata-live-smoke.js`、`node scripts/check-usage-metadata-live-smoke.js` 和 `npm --prefix tools/agent-bridge run check`，均退出码 0；本轮没有 ArkTS 修改、HAP 构建或设备安装。
- R28 只关闭 Mock Provider 驱动的 Bridge 生命周期源码子阶段；第 22、34 项仍等待真实 Provider quota/compaction/metadata、真机 Usage/Diagnostics 展示和现场数据。

### R29 Usage event normalization 证据

- `tools/agent-bridge/src/agent-experience-manager.js` 新增共享 `usageEventNumber()` 校验；token/quota/compaction 仅接受非负安全整数，cost 仅接受非负有限数，聚合阶段对历史事件再次校验。
- `UsageManager.record()` 只有 inputTokens 与 outputTokens 同时存在时才推导 totalTokens；单侧 token、负数、Infinity、超出安全整数和负 cost 均不进入事件字段，保留 unavailable 语义。
- `provider-usage-service.js` 的 quota DTO normalizer 同步要求非负安全整数；小数、负数、Infinity、NaN 和超限值不会进入 Provider usage windows 或 quota event。
- 新增 `tools/agent-bridge/scripts/check-usage-event-normalization-smoke.js`，覆盖非法值、单侧 token、预算跨阈值、有效小数 cost、compaction、重复事件、重启恢复和 host 隔离；`check:r29` 已纳入 `postcheck`。
- 本轮实际执行 R29 定向 smoke、`node scripts/check-usage-recovery-smoke.js`、`npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均退出码 0；本轮未修改 ArkTS、未构建或安装 HAP。

### R30 Provider Usage freshness 证据

- `normalizeProviderUsage()` 公开可选 `stale` 字段；Provider 显式 stale 或有效 `expiresAt` 不晚于当前时间时标记 stale，仍保留 `ok/status` 和已脱敏窗口供只读展示。
- `providerUsageQuotaEvents()` 对 stale snapshot 返回空，避免过期 quota 重复写入 UsageManager；没有 `stale` 字段的旧结果继续按既有行为生成 event。
- App `AgentBridgeProviderUsageResult`/parser 增加 `stale=false` 安全默认值，Provider Usage 状态使用本地化 stale 文案；新增 `AgentBridgeM5Parser` stale 解析断言。
- 新增 `scripts/check-provider-usage-freshness-smoke.js`，覆盖未来 expiry、过去 expiry、Provider 显式 stale、非法 expiry 和旧结果兼容，并接入 `check:r30`/`postcheck`。
- 本轮实际执行结果记录在 `docs/agent-bridge-r30-provider-usage-freshness-progress.md`；真实 Provider quota、长会话 compaction、metadata 和真机展示仍是现场门。

### R31 Fleet executor failure 证据

- `AgentHomeDaemonFleetCoordinator.run()` 对 executor 异常使用稳定脱敏消息 `Daemon rolling operation failed before completion.`；首个异常实例进入 `failed`，后续目标保留 `pending`，不自动回滚。
- `AgentHomeDaemonFleetCoordinator.test.ets` 新增异常首错、调用次数、失败消息和 pending 目标断言；测试已在既有 `List.test.ets` 注册路径下参与 ArkTS 编译。
- 本轮实际执行 Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP SHA-256 `E264D2EED61351B6292F60471DC557271E73C4B7134B5E61082A91EFF810D8C9`。
- R31 只关闭 Fleet executor 异常的源码子阶段；跨 Windows/Linux/macOS、双 Bridge、真实 rolling restart/update/rollback 和权限现场仍属于第 14 项 FIELD 门。

### R32 Remote config state integrity 证据

- `tools/agent-bridge/src/daemon-remote-config-manager.js` 对 schema v1 的版本、scope、priority、values 深度/数量/字符串长度、有限数值和签名编码执行统一校验；未知顶层字段返回兼容 warning。
- Bridge 启动离线 reconcile active/previous/fetched；损坏 active/previous 保留 validation 并标记 degraded，损坏 fetched 清除；validate/preview/apply/rollback 重新计算摘要，状态写盘失败返回 `state_persist_failed` 且不消费 plan。
- `tools/agent-bridge/scripts/check-daemon-remote-config-smoke.js` 覆盖 schema、unknown field、损坏 previous、rollback 阻断、digest 漂移、状态脱敏和写盘失败；`check:r32` 已进入 `postcheck`。
- 本轮实际执行 R32 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均退出码 0；跨平台 daemon、真实签名配置和双 Bridge rolling 仍为第 14 项 FIELD 门。

### R33 Voice session state 证据

- `ngf_framework/src/main/ets/media/contracts/IVoicePlatform.ets` 新增 `NGFVoicePermissionState`、`NGFVoiceAudioSessionState`、`app_background` failure category，以及权限 remediation 和音频会话状态字段；`media/index.ets` 与 `media/contracts/index.ets` 均公开导出。
- `VoicePlatformFacade` 后台拒绝录音，权限执行 check -> request -> re-check；主动 AudioSession deactivation 使用期望事件计数，系统中断使用活动音频检查和 in-flight guard，重复 cleanup 不生成虚假 interruption。
- `tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js` 增加上述源码断言，`entry/src/test/AgentBridgeVoiceParser.test.ets` 覆盖默认 inactive/unknown 与权限 remediation 字段；本轮 Voice contract smoke、Bridge 全量 `npm run check` 和 `git diff --check` 均退出码 0。
- SDK 23 HAP 构建本轮退出码 0，产物 SHA-256 `FC5C1C4EAA590468287463AE444863516CEEA35831322A15113599CD186E7837`；仅向 `5KLBB25A10203862` 尝试安装，HDC 返回 `9568423`（签名 profile 未授权 UDID），未启动或测试，也未向其他设备安装。
- R33 只关闭 Voice session state 源码子阶段；第 21、33 项仍等待真机权限/路由、耳机蓝牙、来电抢占、弱网长录音和真实 STT/TTS Provider。

### R37 Voice playback generation 证据

- `ngf_framework/src/main/ets/media/facades/VoicePlatformFacade.ets` 为每个远程 `AVPlayer` 捕获 `remotePlaybackGeneration` 和当前 player identity；`stateChange` callback 在调用完成/错误处理前校验两者，迟到旧播放器事件直接丢弃。
- 释放路径保存 facade 当前 callback，并使用同一 callback 调用 `player.off('stateChange', stateCallback)`；stop/release 先推进 generation，之后清空 player、callback、请求标识和音频缓冲。
- `tools/agent-bridge/scripts/check-voice-platform-contract-smoke.js` 新增 generation、player identity、callback 保存/注销和 stop invalidation 断言；本轮定向 smoke 和 Bridge 全量 `check` 均退出码 0。
- 本轮 SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，HAP 为 `entry/build/default/outputs/default/entry-default-signed.hap`，14,246,132 bytes，SHA-256 `F378C3863E3CA8DF22CF9DF1073E54F1DAFFB3EEB8B62AD0CC39CD20EDA4143D`；`git diff --check` 退出码 0。
- 本轮没有安装、启动或测试设备；第 21、33 项仍保持“部分实现”，真实音频现场和 Provider 服务由 FIELD 轨道管理。

### R38 Voice TTS cancellation 证据

- `tools/agent-bridge/src/voice-manager.js` 为 TTS request 保存 `cancelled` 和 request identity；`stop`、`detachOwner`、`shutdown` 在 abort 前标记取消，避免 Provider 忽略 AbortSignal 时仍被视为活动请求。
- Provider response 解析后以及 `tts.ready` 发布前调用 active request 校验；请求已取消、signal 已 abort 或 manager 中已不存在该 request 时，返回稳定 `voice_cancelled`，不发布 `tts.ready`。
- `tools/agent-bridge/scripts/check-voice-manager-smoke.js` 新增延迟 Provider 取消竞态测试；本轮 `node --check`、Voice manager smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0。
- 本轮没有 ArkTS 修改，因此没有重复 SDK 23 HAP 构建；没有安装、启动或测试设备。第 21、33 项仍等待真实 Provider 取消/超时、弱网和真机音频现场。

### R39 Voice TTS client correlation 证据

- `AgentBridgeVoicePayload`/`AgentBridgeVoiceResult` 增加可选 `clientRequestId`；parser 对缺字段使用空字符串安全默认，旧 Bridge 继续兼容内部 `requestId`。
- `VoiceManager` 对 client id 执行长度/字符校验，在 TTS lifecycle 结果中回显；`voice.tts.stop` 携带 client id 时优先 owner-scoped 查找，避免过期内部 id 误停其他请求。
- `NGFAgentHomePage` 为每次远程播放生成新的 client id，保存 speak RPC/internal id，等待响应阶段即可中断；取消快照和当前关联共同阻断迟到结果或其他连接事件。
- 本轮实际执行 Voice manager/protocol 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP SHA-256 `5EA2E28465CA69451AD6B1CA30DB7EFFB2CD2E862EAA272F6C90EFDEBC4D9C40`。
- HAP 仅向 `5KLBB25A10203862` 执行安装尝试，HDC `9568423`（签名 profile 未授权设备 UDID）；未启动、未读取日志、未截图、未测试，也未操作其他设备。真实 Provider 取消/超时、弱网和真机音频现场仍待 FIELD。

### R34/R35 Compatibility protocol 证据

- entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets、NGFAgentHomePage.ets 和 AgentBridgeBrowserParser.test.ets 已完成 R36 host metadata/readiness、ready-only dispatch、受控错误类别、下载状态和 workspace-relative 上传范围接线；本轮 SDK 23 HAP、Bridge 全量 check 与 git diff check 通过。HAP SHA-256 F15C24A2F0A8BC393F5292984EDB0C317960874D209EE945ECA5BBF795E39461。仅向 5KLBB25A10203862 尝试安装，HDC 9568423（签名 profile 未授权 UDID），未启动或测试；真实平台 host、浏览器服务、上传下载和真机动作仍为 FIELD。
- `AgentBridgeCompatibilityInfo`、serverInfo parser 和兼容卡现在保留协议最低/建议/支持摘要；旧 Bridge 缺少支持列表时，Bridge `buildCompatibilityInfo()` 使用同一协议族数字后缀比较 minimum protocol，缺少客户端协议或族不一致返回 `unknown`。
- `tools/agent-bridge/scripts/check-compatibility-matrix-smoke.js` 覆盖 minimum-only、低版本 blocking、缺字段、协议族不一致和显式支持列表；`check:r35` 已接入 `postcheck`。
- R34 的 diagnostics smoke、Bridge 全量 check、SDK 23 HAP 构建和指定设备安装结果记录在 `docs/agent-bridge-r34-compatibility-protocol-progress.md`；R35 本轮只修改 Node Bridge，不重复 HAP/设备操作。

### R43/R44 Voice request 与事件 scope 证据

- R43 的 `AgentHomeVoiceRequestCoordinator` 将远程 STT start/finish/cancel 与 hostProfileId、connection epoch、request id、Bridge session id 和取消状态绑定；迟到 session/transcript/VAD/chunk 结果不会覆盖当前 Voice UI。定向 protocol alignment、Bridge 全量 check、SDK 23 HAP 构建结果和边界记录见 `docs/agent-bridge-r43-voice-request-scope-progress.md`。
- R44 修正 `VoiceManager` 到 server 的事件边界：STT/TTS/session/VAD lifecycle event 只携带内部 owner metadata 到路由层，`voice-event-router.js` 按 connectionId 单播，server 在发送前剥离 owner 字段；无 owner 或不匹配连接不会收到事件，避免 transcript、VAD、TTS 状态或音频结果跨连接泄露。
- `tools/agent-bridge/scripts/check-voice-event-scope-smoke.js` 覆盖双连接单播、空 owner 阻断、owner metadata 和 server 静态接线；本轮实际执行该定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 与 `git diff --check` 均退出码 0。本轮仅修改 Node Bridge，未生成或安装 HAP，未启动或测试设备。
- R43/R44 只关闭 Voice 请求/事件 scope 的源码子阶段；第 21、33 项仍保持“部分实现”，真实 Provider、真机权限/音频路由、弱网、耳机/蓝牙、来电抢占和长录音继续作为 FIELD 门。

### R45 Browser event scope 证据

- `tools/agent-bridge/src/browser-event-router.js` 按 owner connectionId 精确单播 Browser lifecycle 事件；空 owner、未知 owner 和不匹配连接不会收到事件。
- `BrowserAutomationManager` 为 host 注册/注销和 permission 更新事件携带内部 owner metadata；`server.js` 发送前删除 `ownerId`，不再使用 Browser 全局广播，`browser.permission.set` 执行入口传入当前 connectionId。
- `tools/agent-bridge/scripts/check-browser-event-scope-smoke.js` 覆盖双连接投递、空/未知 owner 阻断、公开 payload 去除 owner 和 server 静态接线；`check-browser-automation-manager-smoke.js` 回归通过。
- 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；包含 precheck、主 check、R12/R13/R26/R27/R28/R29/R30/R32/R35 和 Voice platform postcheck。`git diff --check` 退出码 0，仅有既有 LF/CRLF 提示。
- 本轮未修改 ArkTS，未生成或安装 HAP，未启动或测试设备。R45 只关闭 Browser 事件 scope 源码子阶段；真实 platform host、HarmonyOS App 全量动作、恶意页面、登录态、上传下载和长流仍由第 16、23D 的 FIELD 门管理。

### R46 Service event scope 证据

- `tools/agent-bridge/src/service-event-router.js` 按运行期 owner connectionId 对 `workspace.service.updated` lifecycle 事件执行精确单播；空 owner、未知 owner 和不匹配连接均不会收到事件，server 发送前会移除内部 `ownerId`。
- `ServiceProxyManager` 只在内存保存 `serviceId -> connectionId` owner map；upsert/start/stop/health/remove 的 WebSocket 请求记录 owner，进程 error/exit、health、stop、remove 复用 owner，remove 或 WebSocket 断开时清理映射，不写入持久化 service state。HTTP 兼容 RPC 没有 owner 时仍返回同步结果，但不会向其他连接广播 workspace、cwd、端口或运行状态。
- `tools/agent-bridge/scripts/check-service-event-scope-smoke.js` 覆盖双连接隔离、空/未知 owner 阻断、断开清理、公开 payload 脱敏和 server 静态接线；`check:service-event-scope` 已加入 `postcheck`。本轮实际执行该 smoke、Service Proxy manager smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check`，均退出码 0。
- 本阶段未修改 ArkTS，未构建或安装 HAP，未启动或测试设备。R46 只关闭 Service lifecycle event scope 源码子阶段；真实域名解析、跨 host/workspace 权限、长 HTTP/WebSocket 代理和服务进程重启恢复仍由 23C/FIELD 管理。

### R47 Automation event scope 证据

- `tools/agent-bridge/src/automation-event-router.js` 为 schedule、loop、chatRoom 建立运行期实体/workspace scope registry；事件缺少实体或 workspace scope 时不投递，匹配后只向已成功读取或写入对应实体的连接单播。
- server 的 Schedule、Loop、Chat Room `onUpdated` callback 已移除 `broadcastToClients`，成功 RPC 结果通过 `sendAutomationResponse()` 登记订阅；WebSocket 断开调用 `clearAutomationEventScopes()`，连接重建不会继承旧订阅。`chat-room-manager.js` 为 lifecycle event 增加 `workspaceId`，不增加内部连接信息。
- `tools/agent-bridge/scripts/check-automation-event-scope-smoke.js` 覆盖双连接 schedule/loop/room 隔离、workspace 匹配、未知 scope 阻断、断开清理和 server/manager 静态接线；Schedule、Loop、Chat Room 原有 smoke 均通过。本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`（含 postcheck 的 `check:automation-event-scope`）与 `git diff --check`，均退出码 0。
- 本阶段未修改 ArkTS，不构建或安装 HAP，未启动或测试设备；R47 只处理自动化协作事件传输边界，不重新打开已实现的 18、19、20 项。真实多连接 App、权限变化、daemon 重启重新订阅和长时间运行仍由现场验收管理。

### R78 Provider capability integrity 证据

- `tools/agent-bridge/src/provider-registry.js` 将 `metadataGeneration` 绑定到 `generateMetadataResult()`/`generateMetadata()`，将 `usageEvents` 绑定到 `usageEventsAvailable=true`；缺少 runtime 实现时，descriptor 的静态 true 会降级为 false。
- `providerUsage` 只接受原生 `getUsage()` 或安全 HTTPS endpoint；HTTP、格式错误和 URL 内嵌用户名/密码的 endpoint 不再把 quota 刷新入口发布为可用。
- Mock、Codex App Server、OpenCode 和 Gateway 的 usage producer 显式标记；Codex exec fallback 与非法 runtime 配置保持 usage/metadata 不可用。`check-provider-runtime-capability-smoke.js` 覆盖静态声明降级、Mock capability、invalid Codex runtime、HTTPS/HTTP/凭证 endpoint 和 catalog 透传，`check:r78` 已接入 `postcheck`。
- 本轮只修改 Node Bridge 与文档；定向 syntax/smoke、`npm run check:r78`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 均退出码 0，未修改 ArkTS/HAP，未安装、启动或测试设备。真实 Provider quota/metadata、长会话 compaction 和 App/真机展示仍是第 22、34 项 FIELD 门，不改变其“部分实现”状态。

### R79 Provider usage availability state 证据

- `provider-usage-service.js` 为 `provider.usage.list` 增加可选 `availabilityState`，统一表达 `unsupported`、`available`、`available-empty`、`failed`、`stale` 和 `loading`；既有 `status`、`ok`、`stale` 字段保持兼容。
- 未配置 adapter/endpoint 的结果归一化为 `unsupported`；Provider runtime、HTTP、超时和响应错误归一化为 `failed`；成功但没有 plan/window/detail 的响应归一化为 `available-empty`；有真实数据为 `available`；过期快照为 `stale`。
- App `AgentBridgeProviderUsageResult`、parser 和 Agent Home 状态文案已接入强类型常量、旧字段推导与中英文资源；新增 `check-provider-usage-availability-smoke.js` 并注册 `check:r79`/`postcheck`。
- 本轮实际执行 `npm --prefix tools/agent-bridge run check:r79`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP 大小 `14,390,147` bytes，SHA-256 `0F979D1BB48873AED61D10E1557BCEB6ECCCF4ECD0F71A6AE7C49AF58A9EE052`。指定设备 `5KLBB25A10203862` 为 Connected，仅向该 target 执行一次安装，HDC 返回 `9568423`（签名 profile 未授权 UDID）；未启动、未测试、未操作其他设备。
- R79 只关闭 Provider usage 状态语义源码子阶段；真实 Provider quota、长会话 compaction、四类 metadata 和 App/真机现场仍由第 22、34 项 FIELD 门管理。

### R80 App usage budget currency integrity 证据

- Agent Home 预算币种 draft 的初始值、Bridge 预算响应回填、scope 切换、清除和重置均保持空字符串表示 unavailable；不再把缺少真实币种的预算显示为 USD。
- 成本预算仍要求用户显式填写币种；Bridge 返回的真实币种按 parser 结果保留。
- `check-app-usage-budget-currency-smoke.js` 已接入 `check:r80`/`postcheck`；本轮实际执行定向 syntax/smoke、`npm run check:r80` 与 `git diff --check` 均退出码 0。
- R80 未执行 SDK 23 HAP 构建或设备安装；第 22、34 项真实 Provider/真机 FIELD 门不变。

### R82 Usage aggregate integrity 证据

- `UsageManager.summary()` 现在按 `providerId + quotaSource + window` 保留多个 quota window；token 聚合累加超出安全整数范围时移除该字段，cost 聚合溢出时移除对应币种，避免返回 `Infinity` 或截断值。
- `usage.budget.set` 对 token 上限要求非负安全整数；小数和超安全范围输入返回 `invalid_budget_limit`，旧的合法 token-only/cost budget 行为保持兼容。
- 新增 `check-usage-aggregate-integrity-smoke.js` 覆盖双窗口、预算边界、token/cost 溢出和重载恢复；已接入 `check:r82` 与 `postcheck`。
- 本轮实际执行定向 syntax/smoke、usage normalization/recovery/provider usage smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check`，均退出码 0；本轮无 ArkTS/HAP 改动，未安装、启动或测试设备，用户指定设备 `5KLBB25A10203862` 未操作。
- R82 只关闭 Usage 聚合完整性源码子阶段；真实 Provider 多窗口账单、长会话 compaction、metadata 生产数据和 App/真机展示仍属于第 22、34 项 FIELD 门。

### R83 Usage quota ordering 证据

- `UsageManager.summary()` 对同一 Provider/source/window 的多个 quota event 按规范化 `occurredAt` 选择最新快照；迟到旧事件不会回退展示值，其他窗口独立保留。
- 相同或不可解析时间使用稳定 `eventId` tie-break，持久化事件历史保持追加，不执行删除或就地改写。
- `check-usage-quota-order-smoke.js` 已覆盖迟到旧事件、双窗口和重载恢复，并注册为 `check:r83`/`postcheck`；本轮定向 smoke、R82 回归、Bridge 全量 check 和 `git diff --check` 通过后才关闭该源码子阶段。
- 本轮无 ArkTS/HAP 改动，未安装、启动或测试设备；真实 Provider 并发刷新、限流和真机 Usage/Diagnostics 仍属第 22、34 项 FIELD 门。

### R84 App quota window compatibility 证据

- App quota parser 已从 summary/budget 的受限窗口归一化中分离，保留经过长度、控制字符、Unicode 行分隔符、路径分隔符和路径段校验的 Provider 自定义窗口；非法窗口保持 unavailable。
- Agent Home 对合法未知 quota window 显示原始安全名称，避免把 hour 等 Provider 窗口错误显示为 session；旧 Bridge 缺少或返回非法字段时继续使用既有安全默认值。
- AgentBridgeM5Parser.test.ets 已加入 hour、rolling-7d、路径穿越、反斜杠、控制字符和超长窗口断言；本轮定向 Usage 回归、Bridge 全量 check、SDK 23 HAP assembleHap 和 git diff --check 均退出码 0，HAP SHA-256 为 B8452ACCE84DF27E0B9E7D35F852FDF93A04D158C15209C9742654060DA0591E。
- R84 只收口 App parser/UI 语义，不改变第 22、34 项“部分实现”状态；真实 Provider 自定义 quota、长会话和指定真机 Usage/Diagnostics 仍为现场验收门。

### R85 App quota event window compatibility 证据

- `AgentBridgeIncomingParser.parseUsageEvents()` 先解析 `kind` 和 quota 字段证据；quota 事件或带 `quotaRemaining`、`quotaLimit`、`quotaResetAt`、`quotaSource` 的旧事件使用 `normalizeQuotaWindow()`，普通 usage/metadata/compaction 事件继续使用 `normalizeUsageWindow()`。
- `AgentBridgeM5Parser.test.ets` 新增 `kind=quota`、quota source 兼容、普通事件回退和恶意 `../secret` 窗口断言；未知安全窗口仍保持原名。
- 本轮实际执行 `npm run check:r82`、`npm run check:r83`、`npm run check:r79`、`npm run check:r30`，均退出码 0；Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0。
- 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`，退出码 0；HAP 大小 `14,388,394` bytes，SHA-256 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`。`git diff --check` 无实际空白错误，仅有既有 LF/CRLF 转换提示。
- 本轮未安装、启动或测试设备；R85 是解析语义收口，不属于重大 App 功能更新。第 22、34 项真实 Provider、长会话和真机 Usage/Diagnostics 现场门保持不变。


### R86 Daemon Fleet 版本与配置校验证据

R86 收口第 14 项的 rolling 版本一致性：App 连接池传播 Bridge/config 版本，coordinator 对 restart 的当前版本和 update 的目标版本执行校验，代际变化、健康状态或目标身份不满足时首错停止。源码测试覆盖版本匹配、Bridge/config drift、update target 和全排除结果。第 14 项仍因 Windows/Linux/macOS 全局安装、自启/升级回滚、真实双 Bridge rolling 与签名远程配置现场而保持“部分实现”；普通沙箱的 `.hvigor` 日志写入限制已通过用户授权的受控构建绕过并记录。

### R91 Daemon Fleet App 聚合摘要证据

- `AgentHomeDaemonFleetConnectionPool.ets` 新增 `AgentHomeDaemonFleetSummary`、`AgentHomeDaemonFleetDistribution` 和 `summarizeDaemonFleetResults()`；聚合健康状态、Bridge/config 版本、告警实例和缺失 heartbeat，空版本使用 unavailable 语义。
- `NGFAgentHomePage.ets` 在 Fleet 区展示汇总行和实例最近 heartbeat；不可达/旧 Bridge 仍为只读摘要，不会进入 `AgentHomeDaemonFleetCoordinator` rolling pending 集合。
- `AgentHomeDaemonFleetConnectionPool.test.ets` 覆盖 healthy/degraded/unreachable、重复 Bridge 版本、缺失 config/heartbeat 和 warning count；资源通过 `scripts/i18n_updater.py` 写入 base/en_US/zh_CN。
- 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；Docker runtime 按仓库规则受控跳过。`git diff --check` 无实际空白错误，仅有既有 LF/CRLF 提示。
- 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`，退出码 0，`BUILD SUCCESSFUL in 37 s 965 ms`；HAP 大小 `14,422,067` bytes，SHA-256 `F6B929E21979DF4ECCDCB2B8CDB95E116005FF9F26BC96AB9661BB45F2EF52C1`。
- 本轮未安装、启动或测试设备；Windows/Linux/macOS 全局 daemon、自启/升级回滚、双 Bridge rolling 和真实 heartbeat/generation 仍属于第 14 项现场门。

### R92 Browser host warning 公共边界证据

- `tools/agent-bridge/src/browser-automation-manager.js` 的 `normalizeCapabilityWarnings()` 在 Browser host 注册/更新入口统一处理外部 warning：只接受字符串，清理控制字符，限制条目数量和 UTF-8 长度，去重后再写入 host DTO。
- URL、Windows/Unix 常见绝对路径以及 Bearer/token/password/secret/authorization/cookie/api-key 等 credential 片段均替换为稳定占位符；公共 `listHosts()`、生命周期事件和 App/Web parser 不再接触原始敏感值。readiness、capability gate、dispatch 和 `browserPlatformHost=false` 语义不变。
- `tools/agent-bridge/scripts/check-browser-automation-manager-smoke.js` 增加 URL、路径和 credential 泄露断言；本轮已实际执行 `node --check src/browser-automation-manager.js`、`node --check scripts/check-browser-automation-manager-smoke.js` 和 `node scripts/check-browser-automation-manager-smoke.js`，均通过（`browser automation manager smoke ok`）。
- 全量 Bridge `npm --prefix tools/agent-bridge run check` 将在本轮重新执行并记录；真实受支持 Browser host、恶意页面、登录态、上传/下载、HarmonyOS App 全量动作、旧 Bridge、多标签和长流仍是第 16、23D 的现场验收门，不能由该公共 DTO 子阶段关闭条目。

### R93 Browser page.logs 公共 DTO 脱敏证据

- `BrowserAutomationManager.handleHostResult()` 对 `pending.command=page.logs` 使用 `sanitizeBrowserLogsHostResult()`，递归限制日志条数、深度、对象键数和 UTF-8 文本大小；未知 host 字段不再原样复制。
- 日志文本沿用 Browser warning 的控制字符、URL、Windows/Unix 路径和 Bearer/token/password/secret/authorization/cookie/api-key 脱敏；`headers`、`cookies`、private-key 等敏感键被过滤，过量日志以 `truncated` 公开。
- `check-browser-automation-manager-smoke.js` 使用伪造外部 host 结果断言 `page.logs` 不包含 URL、路径、Bearer 值、credential/error secret 或 headers；`npm run check:browser` 实际退出码 0，Browser manager、event scope、CDP、live automation 和 protocol alignment 均通过。
- 本轮会重新执行 Bridge 全量 check 并记录；真实平台 host、恶意页面、登录态、上传/下载、HarmonyOS App 全量动作、旧 Bridge、多标签和长流仍由第 16、23D 现场轨道验收。

### R135 Browser action target state binding 证据

- `BrowserAutomationManager.action()` 对敏感 action 在支持时先派发只读 `page.snapshot`，以现有公开 DTO 边界限制 snapshot 后在内存计算 `pageId + instanceId + snapshot` SHA-256 digest；plan 只保存请求/host binding、target-state mode/digest 和 warning，不保存页面正文。
- Confirm 重新获取绑定 host/page 的 snapshot；digest 变化返回 `browser_target_changed` 且不会派发 page action。platform/HarmonyOS host 缺少 `page.snapshot`、snapshot 失败或结构非法时分别 fail closed；旧 external/CDP/native/custom host 兼容降级并返回 `browser_target_snapshot_unavailable` warning。
- manager smoke 新增状态变化、platform capability 缺失和 legacy warning 断言；`npm --prefix tools/agent-bridge run check:r135` 和包含新增 postcheck 的 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 均退出码 0，`git diff --check` 通过。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。
- R135 只收口第 16、23D 的 Browser action target-state 源码子阶段；真实平台 host、页面导航/替换、恶意页面/登录态、上传下载、HarmonyOS App 全量动作和现场浏览器仍待验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r135-browser-action-target-state-progress.md`。

### R111 Browser action target snapshot 证据

- `BrowserAutomationManager.action()` 的 preview/confirmed 结果新增受限 `target` 摘要，只包含 `workspaceId`、`agentId`、`hostId`、`instanceId`、`pageId` 和 `action`；URL、文件路径、evaluate 脚本、上传内容、凭证、connection id 与 host 能力摘要均不出现在公共结果。
- confirmed action 在 dispatch 完成后用实际选中的 host id 生成 target，并把 host 返回的 `target` 列入保留字段过滤，避免外部 host 伪造或覆盖目标边界；完整 payload digest、host binding、generation/registration 变化和一次性 plan 消费规则保持不变。
- `AgentBridgeBrowserActionTarget` 与 `AgentBridgeBrowserResult.target` 完成 App parser 接线；缺少 target 的旧 Bridge 使用已知顶层 workspace/host/action 及 instance/page 快照回退，不能从 URL、路径或 warning 推导目标。
- 本轮实际执行 `node --check src/browser-automation-manager.js`、manager smoke、live smoke 和 `git diff --check`，均退出码 0；未执行 HAP 构建、设备安装或设备测试。第 16、23D 仍保持“部分实现”，平台 host、HarmonyOS App 全量动作、恶意页面/登录态和真实上传下载现场不由本轮源码 smoke 替代。

### R133 App download URL credential boundary 证据

- `NGFAgentHomePage.ets` 的消息附件图片、workspace 预览图片和通用 Bridge 下载均改为 `buildBridgeDownloadUrl(downloadPath, endpoint)`；URL builder 不再接受 credential，也不再生成 `token=` 查询参数。
- `server.js` 继续从 `/download/<token>` 路径提取 token 并调用 `workspaceService.consumeDownloadToken(token)`；Bridge RPC 和旧客户端路径保持不变。
- `check-protocol-alignment-smoke.js` 新增精确 App source assertion，验证旧 credential 参数不会回归，并验证服务端继续使用一次性路径 token。
- 本轮实际执行 `node --check scripts/check-protocol-alignment-smoke.js` 和 `node scripts/check-protocol-alignment-smoke.js`，均退出码 0；目标文件 `git diff --check` 无实际空白错误，仅有既有 LF/CRLF 提示。
- 本轮实际执行 `node --check scripts/check-protocol-alignment-smoke.js`、`node scripts/check-protocol-alignment-smoke.js`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均退出码 0。首次 HAP 封装遇到一次性 `.hvigor` build-log `EBUSY`，未删除或清理构建目录，重试成功；HAP 大小 `14,522,413` bytes，SHA-256 `29837DC68661EBBE38F14CF917D36EF0BE405AC7A77908FEC458AED8DD2EC638`。
- 本轮未安装、启动或测试设备。R133 只收口第 16、23B、23D 的下载 URL credential 边界子阶段，三项仍保持“部分实现”，真实 Browser/platform host、Web UI 和真机动作仍为现场门。

### R134 App download path validation 证据

- `NGFAgentHomePage.ets` 在 `buildBridgeDownloadUrl()` 前使用 `isSafeBridgeDownloadPath()`，只接受 `/download/` 下的单一非空 token 段；外部 scheme、额外路径段、query/fragment、反斜杠、百分号编码和控制字符均 fail closed。
- 无效路径在创建 `http.HttpRequest` 前抛出 `download path is invalid`；合法旧 token 字符不受额外 allowlist 限制，Bridge `/download/<token>` 和 `consumeDownloadToken()` 保持兼容。
- `check-protocol-alignment-smoke.js` 新增路径校验静态断言，并保留 R133 credential 不进入 URL 的断言。
- 本轮实际执行 `node --check scripts/check-protocol-alignment-smoke.js`、`node scripts/check-protocol-alignment-smoke.js`，均退出码 0；SDK 23 HAP、Bridge 全量 check 和 `git diff --check` 待本轮后续执行。
- R134 只收口第 16、23B、23D 的 App download path injection 子阶段，三项仍保持“部分实现”，真实 Browser/platform host、Web UI 多标签/长流和真机动作仍为现场门。

### R137 Web Browser host capability/readiness gate 证据

- Web compatibility 新增 `normalizeBrowserHost()`、`normalizeBrowserHostList()` 和统一 `browserHostGate()`；`browser.host.list` 兼容 `{ hosts: [...] }` 与旧数组响应，host 命令/action/warning 等公开字段按类型和长度归一化。
- 平台 host（显式 `platformHost`，或 `hostKind=harmonyos`/`capabilitySource=platform`）只有在 `browserHostCapabilityMetadata=true`、`browserPlatformHost=true`、`connected=true`、`readiness=ready` 同时成立时才允许 Web 命令和 action；缺能力、断开和未就绪只显示不可用状态。
- 旧 external/CDP/native/custom host 缺 readiness/connected 字段时使用 legacy/connected 兼容默认值；显式 degraded/unavailable 或 disconnected 仍由 gate 阻断。
- `src/web/app.js` 的 Browser refresh、host 卡、命令和 action 控件均消费同一 parser/gate；新增 `check-web-browser-host-capability-smoke.js` 并将 `check:r137` 接入 `postcheck`。
- 本轮实际执行 `npm --prefix tools/agent-bridge run check:r137`，退出码 0，输出 `web browser host capability smoke ok`；Node syntax 检查通过。未修改 ArkTS/HAP，未安装、启动或测试设备。
- 该阶段只收口第 16、23B、23D 的 Web host capability 子边界；真实平台 adapter、HarmonyOS App 全量动作、恶意页面/登录态、上传下载、多标签和长流仍为 FIELD 验收，三项继续保持“部分实现”。详见 `docs/agent-bridge-r137-web-browser-host-capability-progress.md`。

### R141 Web composer token/mention 证据

- Web compatibility 新增 composer token parser：未知 kind 安全降级为 `text`，token 列表限制 100 项；Web composer 候选只来自当前 host/workspace scope，文件候选拒绝绝对路径、驱动器路径和 `..` 段。
- `app.js` 已注册 mention 输入、ArrowUp/ArrowDown、Enter/Tab、Escape 和失焦关闭；只有用户选择候选才生成带 scope 的可信 token，workspace/agent/归档/断线/重新登录会清理 token。
- Web 发送优先使用 `message.send`，带 `clientMessageId`、`queuePolicy` 和 `composerTokensJson`；未知 RPC 时兼容回退 `agent.send`。Bridge 两条路径都在 Provider 前调用 `sanitizeComposerTokens()`，旧客户端不会绕过 scope/path 校验。
- 新增 `check-web-composer-smoke.js` 与 `check:r141`，本轮实际执行 `check:r141`、`check:r13`、`check:r88`、`check:browser` 和 Bridge 全量 `npm --prefix tools/agent-bridge run check`，均退出码 0；Docker runtime 按 opt-in 规则 skipped，未修改 ArkTS/HAP、未安装设备。
- R141 仅收口 23B Web composer 源码子阶段，不改变 23B、22、34 的“部分实现”状态；真实旧 Bridge、多标签、长流、Provider、HarmonyOS App 全量动作和指定设备展示仍需现场验收。详见 `docs/agent-bridge-r141-web-composer-mention-progress.md`。

### R142 Web metadata apply 与 Git commit plan 证据

- `WorkspaceService` 为显式 `preview`、`requireConfirm`、`confirm` 或 `planId` 的 commit 请求接入既有 Git plan manager；preview 校验 staged paths、commit message、仓库 snapshot 和 Git generation，无 staged changes 返回 `git_nothing_to_commit`，旧客户端未携带 plan 字段时保持直接 commit 兼容。
- Web metadata Apply 按 kind 使用受控链路：`sessionTitle` -> `agent.update`，`branchName` -> `workspace.git.branch` preview/confirm，`commitMessage` -> `workspace.git.commit` preview/confirm，`pullRequest` -> `github.pr.create` dry-run/confirm；编辑后的 textarea 值作为最终建议，成功后只刷新对应 scope，并有重复提交保护。
- `check-web-metadata-apply-smoke.js`、`check:r142`、workspace Git plan/Git smoke、`check:r88` 和 Bridge 全量 check 已实际通过；本轮未修改 ArkTS/HAP，未构建、安装或操作设备。R142 只收口第 22、34、23B 的 metadata apply 源码子阶段，真实 Provider/GitHub 权限、旧 Bridge、多标签、长流、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r142-web-metadata-apply-progress.md`。

### R143 Web Rich Content AST 证据

- `src/web/compatibility.js` 现在统一归一化 text、code、link、file、tool、todo、diff、warning 和 fallback 节点，限制节点数量、UTF-8 大小、代码行数、URL 协议、文件相对路径和 workspace scope；未知/恶意/超限输入降级为 fallback。
- `src/web/app.js` 使用安全 DOM API 渲染结构化节点，file 只在当前 workspace 复用 Diff 入口，`src/web/rich-content.css` 通过同源 Web asset path 加载；旧 text-only message 继续走原有 fallback。
- `check-web-rich-content-smoke.js` 与 `check:r143` 已实际通过并接入 `postcheck`；本阶段未修改 ArkTS/HAP，未构建、安装或操作设备。R143 只收口第 22、27、23B 的 Rich Content 源码子阶段，真实 Provider 长流、旧 Bridge、多标签、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r143-web-rich-content-progress.md`。

### R148 Web Terminal V2 sequence integrity 证据

- `src/web/terminal-stream-state.js` 解析 NGF2 snapshot header 的 `restoreSeq`、`snapshotSeq`、truncated 和 source，并维护订阅 epoch、expected restore 和 awaiting restore 状态。
- `src/web/app.js` 在 V2 restore 前拒绝 output delta，重复/旧 restore 不替换当前 terminal output；unsubscribe、socket close、shutdown 和手动 snapshot 请求走统一状态 reset/begin API。V1 legacy 文本帧仍兼容。
- `check-web-terminal-stream-smoke.js` 通过 VM 覆盖 NGF2 编解码、旧/重复序列、更新序列、legacy、restore 前 delta gate 和 reset；`check:r148` 已加入 `postcheck`。本轮同时执行 `check:r147`、`check:r65`、`check:r88`、`check:r13`，均退出码 0；未修改 ArkTS/HAP，未构建或操作设备。
- R148 只收口第 23B Web Terminal 源码子阶段；真实长流、宽字符 renderer、旧 Bridge、多标签、HarmonyOS App 和现场性能仍待 FIELD，整体状态不变。详见 `docs/agent-bridge-r148-web-terminal-stream-progress.md`。

### R150 Voice 远程数据保留状态证据

- `VoiceManager.status()` 公开受限 `privacy` DTO，配置仅接受 `not_retained`、`ephemeral`、`retained`；未知值保持 `unknown`，对应远程端点会产生稳定 warning 与 `userNoticeRequired`。
- `serverInfo.features.voicePrivacyStatus=true`、App 强类型 parser、主动 `voice.status` 请求、host 切换清理和中英文风险提示已接线；旧 Bridge 缺字段安全降级。
- `check-voice-retention-smoke.js` 覆盖 policy/source/duration 边界、敏感 endpoint/token 不泄露、Bridge/App/resource 接线；`check:r150` 已加入全量 `postcheck`。本轮定向 smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 已通过。
- R150 只收口第 21、33 的隐私状态源码子阶段，真实 Provider 保留实践、真机权限/音频路由、蓝牙/来电、弱网和长会话仍由 FIELD 轨道验收。详见 `docs/agent-bridge-r150-voice-retention-progress.md`。

### R152 Web Browser 整页截图证据

- `src/web/index.html` 在现有 Browser 工作台内新增整页截图 checkbox，不创建平行页面或后端；默认关闭以保持既有行为。
- `src/web/app.js` 的 `browserScreenshotFullPage()` 读取显式用户选择，`showBrowserScreenshot()` 将结果写入 `browser.page.screenshot` 的 `fullPage` 字段；connection generation、hostId 和 pageId 仍控制迟到响应提交。
- `check-web-browser-screenshot-smoke.js` 覆盖 `fullPage=true` 归一化、UI 标记、实际 payload 和禁止固定 `false`；`check:r152` 已进入 `postcheck`，定向 Web/Browser 回归与带 `system-conpty` 的 Bridge 全量检查本轮均通过，全量退出码为 0。
- R152 未修改 ArkTS/HAP，未执行 SDK 构建或设备操作。真实 platform host、CDP/Chromium 整页截图、恶意页面/登录态、上传下载、多标签和长流仍由 FIELD 轨道验收，第 16、23B、23D 项状态不变。详见 `docs/agent-bridge-r152-web-browser-full-page-screenshot-progress.md`。

### R153 Voice TTS 单次播放证据

- `AgentHomeVoicePlaybackCoordinator` 以 `deliveryIdentity`（clientRequestId -> ttsRequestId -> envelope request id）与单 generation 消费门，保证 `voice.tts.updated` 事件与 `voice.tts.speak` RPC response 双交付路径只播放一次；空身份 fail closed，新 generation 不受上一轮影响。
- Hypium 纯逻辑测试覆盖空身份、重复交付、错误 host/epoch 和新 generation；`check:r153` 已加入 Bridge `postcheck`。SDK 23 HAP 构建通过（14,542,721 bytes，SHA-256 `4E04B5F61A58D9777A558B0334A74479EACB2715393622AA430E22FD94E4D29E`）。
- R153 只收口第 21、33 的远程 TTS 双交付单次播放源码子阶段；压缩音频 AVPlayer 状态机缺口进入 R155，真机与真实 Provider 现场仍由 FIELD 验收。详见 `docs/agent-bridge-r153-voice-tts-single-playback-progress.md`。

### R155 Voice AVPlayer 状态机收口证据

- `VoicePlatformFacade` 压缩音频路径按 SDK 23 官方状态机启动 AVPlayer：idle 注册 `stateChange`/`error` -> `dataSrc` -> `initialized` gate（`NGFRemotePlayerInitializationGate`，10 秒超时、一次性 settle）-> `prepare()` -> `play()`，每个异步阶段以 generation + player 身份 + requestId 复核。
- release 对称 `off('stateChange'/'error')`、reject gate 唤醒初始化等待者且不产生未处理 rejection、仅当前 release generation 才 deactivate AudioSession；正常 completed 与 PCM/raw drain 完成都清 `snapshot.ttsRequestId`（修复 PCM 路径残留，App 播放协调器因此能 complete 并清除 TTS mode）。
- `check:r155` 已接入 `postcheck`；定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP（14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）和 `git diff --check` 本轮通过；未安装、启动或测试设备。真机音频路由、权限、蓝牙/耳机、来电、弱网和真实 Provider 仍由第 21、33 项 FIELD 验收。详见 `docs/agent-bridge-r155-voice-avplayer-state-machine-progress.md`。

### R156 Daemon Fleet App-local availability 证据

- 新增 `AgentHomeDaemonFleetAvailabilityPolicy`：Fleet 面板可见性只依据 App 本地编排能力与已保存 host profiles（hostProfileId + endpoint 非空），不再读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；Fleet 面板从 daemon 诊断区移出为独立设置 stage，当前活动主机旧版或离线时其他已保存 host 仍可查询展示。
- 每个目标仍由自身 `features.daemonFleetTarget` 与实例身份 fail-closed 门控（R122），preview 继续把不 eligible/isolated 目标放入 excluded；`refreshDaemonFleet()` 结果写入前按 hostProfileId 集合一致性（`matchesCurrentProfiles`）校验，与 connectionEpoch host epoch 检查共同保证迟到批次不覆盖当前快照。
- 新增 Hypium policy 测试注册 `List.test.ets`；SDK 23 HAP（14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`）和 `git diff --check` 本轮通过；未安装、启动或测试设备。跨平台 daemon、自启重启、真实双 Bridge rolling、升级回滚和 HarmonyOS App Fleet 真机现场仍由第 14 项 FIELD 验收。详见 `docs/agent-bridge-r156-fleet-app-local-availability-progress.md`。

### R157 Provider Metadata Capability Gate 一致性证据

- `AgentBridgeProviderOption` 新增 `metadataGenerationCapabilityKnown`（parser 按 capabilities 对象是否出现 `metadataGeneration` 键填充）；`supportsMetadataGeneration()` 与 `supportsUsageEvents()` 对齐为同一 known 标志语义：新 Bridge 发布显式 capability（含 false）时按显式值 fail-closed，旧 Bridge 缺字段保留 `serverInfo.features.metadataGeneration` 全局 feature 兼容行为。
- `AgentBridgeM5Parser.test.ets` 断言三态覆盖（显式 true / 显式 false / legacy 缺字段）；SDK 23 HAP（14,545,893 bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`）和 `git diff --check` 本轮通过；未安装、启动或测试设备。真实 Provider metadata、长会话、quota/账单和真机 Usage/Diagnostics 展示仍由第 22、34 项 FIELD 验收。详见 `docs/agent-bridge-r157-provider-metadata-capability-gate-progress.md`。
