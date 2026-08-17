# Agent Bridge 持续对齐推进进度

更新时间：2026-08-15

> 2026-08-15 对齐收口状态总结：新增 `docs/agent-bridge-alignment-closure-status.md`，汇总 R155-R162 七个闭环证据（HAP 大小/SHA-256）、本地源码面审计结论（协议三端对称、无未完成标记、i18n/符号/权限全部验证）、剩余 FIELD 门清单（关联 `docs/agent-bridge-field-acceptance-checklist.md`）与规则遵守记录。所有“部分实现”条目在现场证据就绪前保持原状态。

> 2026-08-15 FIELD 验收清单：新增 `docs/agent-bridge-field-acceptance-checklist.md`，聚合第 14/16/21/22/33/34/23B/23D 项全部现场验收门（跨平台 daemon/双 Bridge rolling、受支持平台 host/恶意页面/登录态/上传下载、真机音频路由/权限/蓝牙/来电/弱网/长录音/真实 Provider、真实 quota/账单/长会话 compaction/metadata、真实旧 Bridge/多标签/长流/浏览器现场），含前置条件、步骤、通过标准与现场执行规则；现场通过前条目一律保持“部分实现”，不允许以 mock/live smoke 替代。本轮未修改产品代码，未安装、启动或测试设备。

> 2026-08-15 R162 ngf_framework zh_CN i18n 资源补齐：继续检查框架模块资源，`ngf_framework/zh_CN` 缺失 31 个 base 键（`ngf_about_*` 文案）；按标准流程 `i18n_updater.py --file --module ngf_framework` 补齐（base/en_US 零改动）。验证 entry 与 ngf_framework 两模块的 base/zh_CN/en_US 三份资源全部双向无缺失；SDK 23 HAP 退出码 0（14,551,995 bytes，SHA-256 `9BC7CDF76C5A9CAC2F2AC350C1367915F549AB87BFEEDF37FB37F2AC234F6114`），`git diff --check` 退出码 0；未安装、启动或测试设备。R162 仅维护资源文件，不改变任何条目状态。详见 `docs/agent-bridge-r162-framework-zh-i18n-backfill-progress.md`。

> 2026-08-15 R161 App zh_CN i18n 资源补齐：资源完整性检查发现 `zh_CN/element/string.json` 缺失 169 个 base 键（base 值以中文为主，运行时会回退 base，功能不受影响）；按项目标准流程 `i18n_updater.py --file` 补齐（base/en_US 零改动）。验证 base/zh_CN/en_US 三份各 1406 键双向无缺失；SDK 23 HAP 退出码 0（14,551,991 bytes，SHA-256 `174F52B23F52B7B3396F6A0802E1B063A26CDDD2C26914050051A0186883A2EA`），`git diff --check` 退出码 0；未安装、启动或测试设备。R161 仅维护资源文件，不改变任何条目状态。详见 `docs/agent-bridge-r161-app-zh-i18n-backfill-progress.md`。

> 2026-08-15 R160 App GitHub 登出入口：协议对称性审计发现 App 端能解析 `github.auth.logout` 结果但无登出方法/入口；`AgentBridgeClient.logoutGitHub()` 发送 `github.auth.logout` RPC，GitHub PR 区新增 Sign out 按钮（`githubAccountId` 非空时启用），`signOutGitHub()` 清理全部本地 GitHub 状态与草稿；i18n `agent_home_github_sign_out` 写入三份资源；`AgentBridgeM7Parser.test.ets` 新增 logout 解析断言。SDK 23 HAP 退出码 0（14,547,897 bytes，SHA-256 `9479614D06ECEE66392D91736A22DF3E5174B9F9A84CD2EFB5D1F8AB0DB05A30`），i18n JSON UTF-8 解析与 `git diff --check` 退出码 0；未安装、启动或测试设备。R160 只收口第 9 项 GitHub 集成的 App 端登出源码缺口，真实 GitHub 账号 token 撤销、多账号和现场行为仍待 FIELD。详见 `docs/agent-bridge-r160-app-github-signout-progress.md`。

> 2026-08-15 R159 Web Browser permission 状态展示：Web 工作台新增 `browser.permission.get` 消费与 `browser-permission-status` 状态区，展示 allowlist 域、受管下载目录状态与更新时间（与 App 端 R69 对齐）；`refreshBrowserPermission` 经 `refreshBrowser` 注入的 refreshIsCurrent（refreshToken + connectionGeneration + socket OPEN + pageClosing + workspace）校验迟到结果，旧 Bridge 缺 RPC 或失败时静默降级；`check-web-ui-contract-smoke.js` 新增两条断言。定向 `check:r13/r88/r116` 与 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 本轮退出码 0，`git diff --check` 退出码 0；未修改 ArkTS/HAP，未安装、启动或测试设备。R159 只收口第 23B、23D 的 Web permission 状态可见子阶段，真实 platform host、恶意页面/登录态、多标签长流、真实上传下载和 HarmonyOS App 全量动作仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r159-web-browser-permission-state-progress.md`。

> 2026-08-15 R158 源码面复审与全量基线：对第 14/16/21/22/33/34/23B/23D 当前源码做复审，确认 Web 工作台结构、Web Browser 11 类动作、MCP/CLI confirm gate、security audit 记录链（不落输入正文/上传内容/截图）、CDP download/upload 边界（marker 公开 + realpath/大小/SHA-256/mtime）、daemon target guard、nonce 101 前校验、Voice 页面生命周期成对订阅、App Browser host readiness 展示、App usage unavailable/estimated 语义均无未收口源码缺口，剩余全部为 FIELD 门。Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 本轮退出码 0（含 postcheck 的 `check:r155`）。详见 `docs/agent-bridge-r158-source-audit-baseline-progress.md`。

> 2026-08-15 R157 Provider metadata capability gate：App 端 `supportsMetadataGeneration()` 改为与 `supportsUsageEvents()` 一致的 known 标志语义——`AgentBridgeProviderOption` 新增 `metadataGenerationCapabilityKnown`，parser 按 capabilities 对象是否出现 `metadataGeneration` 键填充；新 Bridge 发布显式 capability（含 false）时按显式值 fail-closed，旧 Bridge 缺字段保留 `serverInfo.features.metadataGeneration` 全局 feature 兼容行为。`AgentBridgeM5Parser.test.ets` 增加 known 断言；SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，HAP 14,545,893 bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`；`git diff --check` 退出码 0，未安装、启动或测试设备。R157 只收口第 22、34 项的 metadata 门禁一致性源码子阶段，真实 Provider metadata、长会话、quota/账单和真机展示仍待 FIELD，条目继续保持“部分实现”。详见 `docs/agent-bridge-r157-provider-metadata-capability-gate-progress.md`。

> 2026-08-15 R156 Daemon Fleet App-local availability：Fleet 面板可见性改为只依据 App 本地 fleet orchestration 能力与已保存 host profiles（新增 `AgentHomeDaemonFleetAvailabilityPolicy`），不再读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；Fleet 面板从 daemon 诊断区移出为独立设置 stage，当前活动主机旧版或离线时其他已保存 host 仍可查询展示。每个目标仍由自身 `fleetTargetSupported/rollingEligible` 门控写操作（R122 fail-closed 保留），collect 结果写入前新增 hostProfileId 集合一致性校验，host epoch（connectionEpoch）检查保留。新增 Hypium policy 测试并注册 `List.test.ets`；SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，HAP 14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`；`git diff --check` 退出码 0，未安装、启动或测试设备。第 14 项仍保持“部分实现”，跨平台 daemon、自启重启、真实双 Bridge rolling、升级回滚和 HarmonyOS App Fleet 真机现场仍待 FIELD。详见 `docs/agent-bridge-r156-fleet-app-local-availability-progress.md`。

> 2026-08-15 R155 Voice AVPlayer 状态机收口：`VoicePlatformFacade` 压缩音频路径按 SDK 23 官方状态机启动 AVPlayer：createAVPlayer 后在 idle 注册 `stateChange`/`error` listener，再设置 `dataSrc`，等待 `initialized` 后 `prepare()`、`play()`，每个异步阶段以 generation + player 身份 + requestId 复核；新增 `NGFRemotePlayerInitializationGate`（10 秒超时、一次性 settle），release 对称注销 listener、reject gate 唤醒初始化等待者且不产生未处理 rejection、仅当前 release generation 才 deactivate AudioSession；正常 completed 与 PCM/raw drain 完成均清 `snapshot.ttsRequestId`（本轮修复 PCM 路径残留，使 App 播放协调器能 complete 并清除 TTS mode）。smoke 扩展覆盖 PCM 完成清理、gate 一次性 settle、errorCallback reject gate；`check:r155` 已接入 `postcheck`。`check:r155`、`check:voice-platform`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，SDK 23 HAP 构建退出码 0（14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`），`git diff --check` 退出码 0；未安装、启动或测试设备。第 21、33 项仍保持“部分实现”，真机音频路由、权限、蓝牙/耳机、来电、弱网和真实 Provider 仍待 FIELD。详见 `docs/agent-bridge-r155-voice-avplayer-state-machine-progress.md`。

> 2026-08-11 R152 Web Browser full-page screenshot：Web Browser 区新增 `Full-page screenshot` checkbox，截图请求从用户选择读取 `fullPage`，不再固定发送 `false`；响应仍经过 PNG/JPEG/WebP、Base64、签名、大小与 generation/host/page scope 校验，旧 Bridge 缺字段回落为 `false`。新增 `check:r152` 并接入 `postcheck`；本轮已实际通过 `check:r152`、`check:r116`、`check:r13`、`check:r88`、`check:browser` 和带 `system-conpty` 的 Bridge 全量 `npm run check`，全量退出码为 0，Docker runtime 按 opt-in 规则跳过。R152 只收口第 16、23B、23D 的 Web 整页截图源码子阶段；真实 platform host、恶意页面/登录态、上传下载、多标签、长流和浏览器现场仍为 FIELD，条目不提前关闭。详见 `docs/agent-bridge-r152-web-browser-full-page-screenshot-progress.md`。

> 2026-08-10 R151 Browser App action surface：HarmonyOS Agent Home 现在提供完整 Browser action surface，并新增整页截图 Switch；`browserScreenshotFullPage` 会随截图 RPC 传递，parser 覆盖 `fullPage=true`，旧 Bridge 缺字段回落为 `false`。action 控件覆盖 click、fill、type、keypress、hover、select、drag、upload、scroll、download、evaluate，敏感操作仍走 Preview -> Confirm；新增 `check:r151` 已加入 `postcheck`。本轮实际执行 `npm run check:r151`、`npm run check:browser`、资源/package JSON 解析、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均通过；HAP 大小 `14,523,736` bytes，SHA-256 `71D6A09B39D3D5A0006810AA7EBE245A31EF2487DBE713F1FC2E77F26EBCAAB6`。R151 只收口第 16、23D 的 App action surface 源码子阶段，真实 platform host、CDP 页面、恶意页面/登录态、上传下载、弱网长流和真机动作仍待 FIELD，条目不提前关闭。详见 `docs/agent-bridge-r151-browser-app-action-surface-progress.md`。

> 2026-08-10 R149 Web multi-tab experience scope：Web `BroadcastChannel` 新增无凭证 `experience.changed` 事件，事件携带完整 `hostProfileId + workspaceId + agentId + sessionId` scope；queue cancel/retry、usage budget save/clear 和 Provider usage refresh 成功后广播，兄弟标签只刷新当前 Session Experience，不触发全量 workspace/Provider 扫描。新增 `check:r149` 并接入 `postcheck`；本轮实际通过 `npm run check:r149`、受影响的 `check:r65/r88/r13`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty' npm run check`、package JSON 解析和 `git diff --check`，Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。R149 只收口第 22、34、23B 的 Web 多标签源码子阶段，真实双标签、旧 Bridge、长流和 HarmonyOS App 仍待 FIELD，条目不提前关闭。详见 `docs/agent-bridge-r149-web-multitab-experience-progress.md`。

> 2026-08-10 R148 Web Terminal V2 sequence integrity：新增 `src/web/terminal-stream-state.js`，解析 NGF2 `restoreSeq/snapshotSeq`，V2 订阅在权威 restore 到达前丢弃 output delta，重复/旧快照不会覆盖当前输出；unsubscribe、断线、shutdown 和手动 snapshot 维护明确 stream epoch，V1 legacy 文本继续兼容。`check:r148`、`check:r147`、`check:r65`、`check:r88`、`check:r13`、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。R148 只收口第 23B 的 Web Terminal 源码子阶段，真实长流、旧 Bridge、多标签、HarmonyOS App 和现场 renderer 仍待验收，条目不提前关闭。详见 `docs/agent-bridge-r148-web-terminal-stream-progress.md`。

> 2026-08-10 R147 Web Diff pagination integrity：Web `loadDiffPage()` 现在按文件/行游标生成稳定 page key，重复页不会追加；cache 保存 next cursor、truncated、truncationReason 和已加载游标，Details 区展示截断原因并继续加载。`check:r147`、Node syntax、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。R147 只收口第 23B、30 的 Web Diff 分页源码子阶段，真实大仓库、旧 Bridge、多标签、HarmonyOS App 和现场性能仍待验收。详见 `docs/agent-bridge-r147-web-diff-pagination-progress.md`。

> 2026-08-10 R146 Web Usage window scope：Web Session Experience 新增 session/day/month 用量窗口选择；usage summary、events、budget status 与 Provider usage 统一携带当前窗口，queue scope 保持独立；切换窗口按 scope key 清理旧结果并重拉，旧 Bridge 回落或回显不同窗口时显示受控提示。`check:r146`、`check:r28`（live day/month）、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。R146 只收口第 22、34、23B 的 Web usage window 源码子阶段，真实 Provider quota/账单、旧 Bridge、多标签、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r146-web-usage-window-progress.md`。

> 2026-08-10 R145 Web Rich Content capability gate：Web compatibility 将 `richContentAst` 纳入 capability 列表，超过 64 个节点时保留 `fallback(reason=node_limit)`，renderer 缺 flag 时回退原始 text。`check:r143`、`check:r145`、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装、启动或操作设备。该阶段只收口第 22、27、23B 的 Web AST capability/截断源码子边界，真实旧 Bridge、多标签、长流、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r145-web-rich-content-capability-progress.md`。

> 2026-08-10 R144 Provider metadata cleanup：Bridge metadata request state 新增一次性 Provider cleanup hook，取消、timeout 和 WebSocket 断开会触发受控清理并丢弃迟到结果；Mock Provider 支持可取消延迟，Codex App Server metadata turn 携带 request id，在正常完成或取消后 best-effort interrupt/archive 临时 thread 并清除本地 session/message/usage 状态。`check:r26`、`check:r27`、`check:r144`、Codex App Server provider smoke、Node syntax 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未安装、启动或操作设备。该阶段只收口第 22、34 的 Provider metadata 生命周期源码子阶段，真实 Provider、quota/账单、长会话网络恢复和现场 App 展示仍待验收。详见 `docs/agent-bridge-r144-provider-metadata-cleanup-progress.md`。

> 2026-08-10 R143 Web Rich Content AST：Web compatibility 新增受限 AST parser，覆盖 text/code/link/file/tool/todo/diff/warning/fallback；未知或不安全节点 fail-safe 降级，`session.messages` 的 array/messages/timeline/items 旧形状保持兼容。Web renderer 使用 textContent、受控 HTTPS anchor、当前 workspace Diff button 和结构化卡片，不使用 innerHTML/eval；新增同源 `rich-content.css` 与 `check:r143`/postcheck。R143 smoke 和 Node syntax 通过；未修改 ArkTS/HAP，未构建或操作设备。该阶段只收口第 22、27、23B 的 Rich Content 源码子阶段，真实 Provider 长流、旧 Bridge、多标签、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r143-web-rich-content-progress.md`。

> 2026-08-10 R142 Web metadata apply 与 Git commit plan：`WorkspaceService` 为显式 `preview/requireConfirm/confirm/planId` 的 commit 请求接入既有 Git plan manager，preview 校验 staged paths、消息和仓库 snapshot，旧客户端未带 gate 时保持直接 commit 兼容；Web metadata apply 现在按 kind 分别调用 `agent.update`、`workspace.git.branch` preview/confirm、`workspace.git.commit` preview/confirm 和 `github.pr.create` dry-run/confirm，加入重复点击 guard 与最小 scope 刷新。`check:r142`、`check:r88`、workspace Git plan/Git smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则 skipped。本轮仅修改 Node/Web/smoke/文档，未修改 ArkTS/HAP、未构建或操作设备。R142 只收口第 22、34、23B 的 metadata apply 源码子阶段，真实 Provider、GitHub 权限、旧 Bridge、多标签、长流、HarmonyOS App 和真机现场仍待验收。详见 `docs/agent-bridge-r142-web-metadata-apply-progress.md`。

> 2026-08-10 R140 Fork context credential redaction：消息级 fork 的边界历史在 child context 持久化前新增 URL userinfo 和敏感 query 脱敏，保留既有 token/header/private-key 过滤和一次性 chat-history 注入；runtime-isolation smoke 已覆盖原始 URL 凭证不可见。`npm --prefix tools/agent-bridge run check:r140` 实际通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 22、34 的 fork context 输入安全子阶段，不替代真实 Provider 长会话、跨 workspace fork 和真机现场验收。详见 `docs/agent-bridge-r140-fork-context-credential-redaction-progress.md`。

> 2026-08-10 R139 Metadata summary credential redaction：`metadata-scope.js` 在 Provider turn 前对 timeline/diff 摘要新增 URL userinfo 和敏感 query 脱敏，保留既有摘要 UTF-8 上限、Bearer/token/private-key 过滤；metadata scope smoke 已覆盖原始凭证不可见。`npm --prefix tools/agent-bridge run check:r139` 实际通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 22、34 的 metadata 输入安全子阶段，不替代真实 Provider metadata、长会话、Git/GitHub 应用和真机现场验收。详见 `docs/agent-bridge-r139-metadata-summary-credential-redaction-progress.md`。

> 2026-08-10 R138 Provider usage credential redaction：Provider usage 公共文本现在在 RPC/持久化前移除 URL userinfo 和敏感查询参数，并继续保留 Bearer/token/private-key 脱敏；message、warning、detail 三类字段由 smoke 覆盖。`npm --prefix tools/agent-bridge run check:r138` 实际通过，`check:r138` 已接入 `postcheck`。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 22、34 的 Provider usage 公共边界，不替代真实 Provider quota、账单、长会话、metadata 和真机现场验收。详见 `docs/agent-bridge-r138-provider-usage-credential-redaction-progress.md`。

> 2026-08-10 R136 Web Browser target state consumption：Web compatibility 新增 `normalizeBrowserActionTarget/TargetState/Result`，Browser action Preview/Confirm 统一消费 bound、legacy、changed 和旧 Bridge 缺字段结果；legacy host 的 `browser_target_snapshot_unavailable` 进入确认提示与完成状态，`browser_target_changed` 保留稳定 remediation，敏感参数不展示。`npm --prefix tools/agent-bridge run check:r136`、Web UI contract/live/session smoke 和 `git diff --check` 本轮通过；`check:r136` 已接入 `postcheck`。本轮仅修改 Node/Web/smoke/package/doc，未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 23B、23D 的 Web target-state 消费子阶段，真实浏览器多标签、平台 host、恶意页面/登录态、长流、上传下载和 HarmonyOS App 全量动作仍待现场验收。详见 `docs/agent-bridge-r136-web-browser-target-state-progress.md`。

> 2026-08-10 R135 Browser action target state binding：Bridge `browser.page.action` 对需要确认的敏感动作在支持时先请求受限 `page.snapshot`，仅在内存计算 `pageId + instanceId + snapshot` 的 SHA-256 digest；plan 不保存页面正文，Confirm 重新读取并在 digest 变化时返回稳定 `browser_target_changed`，不派发 action。platform/HarmonyOS host 缺少、失败或返回非法 snapshot 时 fail closed；旧 external/CDP/native/custom host 保留兼容路径并返回 `browser_target_snapshot_unavailable` warning。新增 manager smoke 覆盖页面状态变化拒绝、platform snapshot capability 缺失和 legacy warning；`npm run check:r135`（Node syntax、manager smoke、Browser live smoke）退出码 0，`git diff --check` 退出码 0。本轮仅修改 Node Bridge/smoke/package/doc，未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 16、23D 的 Browser action target-state 源码子阶段，真实平台 host、恶意页面/登录态、上传下载、HarmonyOS App 全量动作和现场浏览器仍待验收。详见 `docs/agent-bridge-r135-browser-action-target-state-progress.md`。

> 2026-08-10 R132 Provider compaction reconnect evidence：录制 session smoke 在原有同实例重复回放之外，新增 Provider 实例重建后的完整 compaction replay；新实例产生的三条事件数量和确定性 eventId 必须与首次回放完全一致，覆盖断线/重连后 producer identity 不依赖进程内计数器。`node --check scripts/check-provider-recorded-session-smoke.js`、`npm run check:r131` 和 `git diff --check` 本轮通过；Bridge 代码未新增协议字段，未修改 ArkTS/HAP、未安装、启动或测试设备。该证据只增强第 22、34 的 Provider compaction 重连回归，真实 Provider 长会话、quota、metadata 和现场 App 展示仍待验收。详见 `docs/agent-bridge-r132-provider-compaction-reconnect-progress.md`。

> 2026-08-10 R131 Provider compaction event idempotency：Codex App Server adapter 以 compaction 的稳定 item/compaction id、turn id 或受限时间/原因/token 快照生成确定性 `eventId`，并维护最多 4096 个已发布 id；同一 compaction 在 notification/item 顺序变化、断线重放或重复通知时不会再次发布 `usage.updated`。录制 session smoke 已完整重放 compaction 并断言事件数量与 eventId 列表保持不变。`npm run check:r131`、package JSON 解析、`git diff --check` 和 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 本轮退出码均为 0；Docker runtime 按 opt-in 规则 skipped。本轮仅修改 Node Bridge 与 smoke/文档，未修改 ArkTS/HAP，未安装、启动或测试设备。R131 只收口 Provider usage producer 幂等子阶段，第 22、34 项仍等待真实 Provider quota、长会话 compaction、metadata 与现场 App 展示。详见 `docs/agent-bridge-r131-provider-compaction-idempotency-progress.md`。

> 2026-08-10 R130 Voice STT cancellation：Bridge `VoiceManager` 为每个 STT finish 建立内部 request record/registry；cancel、owner detach、expire 和 shutdown 先标记并中止请求，Provider 迟到响应在 transcript 解析与 final 事件发布前校验 session/request identity。取消统一返回 `voice_cancelled`，不发布 `session.failed`，并在所有路径清零音频 buffer、删除 request/session 状态。`check:r130`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP、未安装设备。该阶段只收口第 21、33 的 Bridge STT 生命周期安全子阶段，真实 Provider、弱网、权限、蓝牙/来电和真机音频路由仍待现场验收，条目继续保持“部分实现”。详见 `docs/agent-bridge-r130-voice-stt-cancellation-progress.md`。

> 2026-08-10 R129 Browser host registration generation：Bridge 为每次成功 host 注册维护内部 `registrationGeneration`；同连接同 `hostId` 重注册会先以 `browser_host_reconfigured` 清理旧 pending command，dispatch/result 和 page.action plan binding 均校验当前代际，旧结果不能覆盖新 capability。该字段不进入公共 App DTO，旧协议保持不变。`node --check`、`check:r129`、Browser manager smoke、`npm run check:browser`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均通过；Docker runtime 按 opt-in 规则跳过。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 16、23D 的 Browser host 生命周期安全子阶段，真实平台 adapter、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收。详见 `docs/agent-bridge-r129-browser-host-generation-progress.md`。

> 2026-08-10 R128 Browser platform action capability：`BrowserAutomationManager` 现在拒绝显式 `hostKind=harmonyos`/`capabilitySource=platform` 且声明 `page.action`、但缺少 `supportedActions` 的 host，返回 `browser_host_action_capabilities_required`；显式空集合返回 `browser_host_capabilities_invalid`。external/CDP/native/custom host 继续兼容旧 `supportedCommands` 注册，未声明的单个 action 仍在执行前返回 `browser_action_unavailable`。`node --check`、Browser manager smoke、`npm run check:browser`、Browser live smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 已通过；Docker runtime 按 opt-in 规则跳过。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。该阶段只收口第 16、23D 的平台 host action capability 源码边界，真实平台 adapter、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待现场验收。详见 `docs/agent-bridge-r128-browser-platform-action-capability-progress.md`。

> 2026-08-10 R127 Browser platform capability fail-closed：Agent Home 新增 `AgentHomeBrowserCapabilityPolicy`；显式 `hostKind=harmonyos` 或 `capabilitySource=platform` 的 host 必须同时具备 `browserHostCapabilityMetadata`、`browserPlatformHost`、连接状态和 `readiness=ready` 才能进入 command/action gate。旧 Bridge 的 external/CDP host 继续保留 legacy connected 兼容。`check:r126`、`check:browser`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP 构建与 `git diff --check` 本轮通过；HAP 大小 `14,513,974` bytes，SHA-256 `9D46569E313A4DCC701701792A5306F895BEC854D6CE9C7B4D59B45027476391`。构建中发现的 ArkTS `arkts-no-standalone-this` 已修复；未执行设备操作。该证据只收口第 16、23D 的 App 平台 capability 源码子阶段，真实平台 adapter、恶意页面/登录态、上传下载和真机全量动作仍待现场验收。详见 `docs/agent-bridge-r127-browser-platform-capability-progress.md`。

> 2026-08-10 R125 Web Browser refresh scope：`refreshBrowser()` 为 hosts/instances/pages 列表链增加 refreshToken + connectionGeneration + workspace/socket/page lifecycle gate；host 切换、workspace 切换、断线重连和 capability 关闭时，旧结果不会覆盖当前 Browser 状态，并清空残留列表/截图。`check:r125`、Node syntax 和 `git diff --check` 本轮通过；全量 Bridge check 将在文档更新后重跑。本轮未修改 ArkTS/HAP、未安装或操作设备。真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待验收。详见 `docs/agent-bridge-r125-web-browser-refresh-scope-progress.md`。

> 2026-08-10 R124 Web bfcache 页面恢复：Web UI 新增 `pageshow.persisted` 生命周期处理；`pagehide` 释放的 WebSocket、刷新定时器、终端流、GitHub watch、pending RPC 和 BroadcastChannel 会在同一标签页从 bfcache 返回时重新初始化，重新获取短期 ticket 并校验连接代际。缺少 endpoint/内存会话或已注销时 fail-closed，不自动重连。`check:r124`、Node syntax 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP、未安装或操作设备。真实多标签、旧 Bridge、长流和现场 Web/Browser host 仍待验收。详见 `docs/agent-bridge-r124-web-page-lifecycle-progress.md`。

> 2026-08-10 R123 Fleet preview snapshot metadata：Agent Home rolling preview 不再按旧参数手工复制 Fleet snapshot；新增 `cloneDaemonFleetSnapshot()` 显式保留 `fleetTargetSupported`、`rollingEligible`、`warningCount`、heartbeat、版本和 isolate 状态，避免 R122 capability gate 在页面边界丢失。Hypium 测试覆盖 capability=false、warning count 和 isolate 复制；SDK 23 HAP 构建退出码 0，14,491,147 bytes，SHA-256 `18DD2E28A9645BBBB45C0DD8B19137365BB23F0D00F646AEE4468E9F4A6F0B2F`；`git diff --check` 通过，未安装、启动或测试设备。第 14 项仍保持“部分实现”，跨平台安装、自启重启、升级回滚、双 Bridge rolling 和 HarmonyOS App Fleet 现场继续待验收。详见 `docs/agent-bridge-r123-fleet-preview-snapshot-progress.md`。

> 2026-08-10 R122 Fleet target capability gate：Fleet snapshot 不再把 `instanceId` 当作可 rolling 能力；`AgentHomeDaemonFleetConnectionPool` 只有在目标自身 `features.daemonFleetTarget === true`、实例身份存在且健康状态可用时才设置 `rollingEligible`，缺字段或明确 false 均 fail-closed，只读展示不进入 rolling。warning 只归一化为数量，不回传 warning 文本；daemon fleet live smoke 新增真实 capability 断言。`node --check scripts/check-daemon-fleet-live-smoke.js`、`npm run check:daemon-fleet-live`（输出 `daemon fleet live smoke ok`）、SDK 23 HAP 构建（14,491,423 bytes，SHA-256 `B3F58525F6EA7E70B0F4B548DD4545E66B5F1E4914590512638C97560DA5993E`）和 `git diff --check` 本轮通过；未安装、启动或测试设备。第 14 项仍保持“部分实现”，跨平台安装、自启重启、升级回滚、双 Bridge rolling 和 HarmonyOS App Fleet 现场继续待验收。详见 `docs/agent-bridge-r122-fleet-capability-gate-progress.md`。

> 2026-08-10 R119 Browser action input boundary：Bridge `browser.page.action` 现在统一校验 ref/sourceRef/targetRef、key、文本/值、evaluate 脚本、drag 坐标和 scroll delta 的长度、控制字符与数值范围；旧 drag 坐标字段兼容规范化，upload 保留 legacy optional-ref。无效输入在 preview/confirm 前 fail closed，不创建 plan 或派发 host。`check:r119`、Browser manager/live/CDP、protocol alignment smoke、Bridge Node syntax 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP、未构建或安装设备。第 16、23D 的真实平台 host、HarmonyOS App 全量动作、恶意页面、登录态和上传下载现场仍待验收。详见 `docs/agent-bridge-r119-browser-action-input-boundary-progress.md`。

> 2026-08-10 R120 Browser action payload projection：Bridge action validator 改为按 action kind 生成最小 payload，URL、路径、headers、环境、非 evaluate 脚本和未知字段不会进入 outbound host envelope；scope 标识和 ref/key 拒绝控制字符，drag steps 归一化为 2–20 整数。`check:r120`、Browser manager/live/CDP、protocol alignment smoke 和 `git diff --check` 本轮通过；本轮未修改 ArkTS/HAP、未构建或安装设备。第 16、23D 的真实平台 host、HarmonyOS App 全量动作、恶意页面、登录态和上传下载现场仍待验收。详见 `docs/agent-bridge-r120-browser-action-payload-projection-progress.md`。

> 2026-08-10 R121 Voice TTS request/playback lifecycle：Agent Home 现在把远程 TTS Provider 等待也纳入统一 active speech predicate，重复点击会按 clientRequestId/Bridge request id 取消当前请求；`AgentHomeVoicePlaybackCoordinator` 增加 playbackStarted/complete 状态转移，NGF media snapshot 在远程资源清理完成后清除页面 TTS mode，host quiesce/失败/停止继续 fail closed。Hypium 纯逻辑边界测试、`check:r121`、Voice contract/manager/event/protocol smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 均通过；SDK 23 HAP 构建退出码 0，`entry-default-signed.hap` 14,492,702 bytes，SHA-256 `3828FFC55FE364A4B1575AFD1744F6E753A9702FC37693D15F14FEE21F7987FC`。本轮未安装、启动或测试设备；真实音频路由、权限、蓝牙/来电、弱网和 Provider 现场仍待验收，第 21、33 保持“部分实现”。详见 `docs/agent-bridge-r121-voice-tts-lifecycle-progress.md`。

> 2026-08-10 R116 Web Browser screenshot preview：Web Browser Automation 现在消费受限的 PNG/JPEG/WebP screenshot DTO，执行线性 Base64 校验、8 MiB 编码/6 MiB 解码上限和 MIME gate，并在独立 `<img>` 中渲染受控 data URL。host/page 切换、断线、Browser capability 关闭和页面生命周期会清理截图状态；Bridge manager 同步拒绝非法或超限外部 host 图片。`check:r116`、`check:browser`、`check:r88`、`check:web-live`、`check:r13`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；Docker runtime 按 opt-in 规则跳过。未修改 ArkTS/HAP，未安装、启动或测试设备。真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD，第 16、23D 保持“部分实现”。详见 `docs/agent-bridge-r116-web-browser-screenshot-progress.md`。

> 2026-08-10 R117 Web Browser screenshot content integrity：Bridge 与 Web compatibility 在既有 MIME、Base64 和大小限制之外增加 PNG/JPEG/WebP magic-byte 校验；伪 PNG、MIME/签名错配和不完整头部均返回 `browser_screenshot_invalid`，有效 JPEG/WebP 使用真实最小签名夹具覆盖。新增独立 `check:r117` 并接入 Bridge `postcheck`；`check:r117`、`check:r116`、`check:browser`、Node syntax 和 `git diff --check` 本轮通过。仅修改 Node/Web smoke 与文档，未构建/安装 HAP，未操作设备；真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍是第 16、23D 现场门。

> 2026-08-10 R118 Voice TTS playback generation gate：新增 `AgentHomeVoicePlaybackCoordinator`，把 TTS 初始化、device/remote playback callbacks 绑定到 generation + hostProfileId + connectionEpoch；页面消失、host quiesce、用户中断和 runtime reset 会使旧回调失效，远程 TTS 结果不会清除新一轮播放状态。新增 Hypium 纯逻辑测试并注册；SDK 23 HAP 构建成功（14,486,681 bytes，SHA-256 `6B719D681B063879AF7F6096D6FE98BA279426F57AE7453E8FDB68366FA3C2D3`），Bridge 全量 check、R117/R116/Browser smoke 和 `git diff --check` 本轮通过。未安装、启动或测试设备；真实音频路由、Provider 和真机现场仍待验收，第 21、33 保持“部分实现”。详见 `docs/agent-bridge-r118-voice-tts-generation-progress.md`。

> 2026-08-10 R115 Web Provider usage details：Web Session Experience 新增 `providerUsage` capability gate、受限 `normalizeProviderUsage()`、Provider 套餐/窗口/details 面板和手动刷新；请求绑定 host/workspace/agent/session/provider scope，旧 Bridge 或不支持 Provider 隐藏区域。`npm run check:r88`、`npm run check:web-live`、`npm run check:browser`、Node syntax 和 `git diff --check` 本轮通过；本阶段仅修改 Node/Web UI 与 smoke，未构建或安装 HAP，未操作设备。真实 Provider、长会话和现场 App/Web 验收仍待补，第 22、34、23B 保持“部分实现”。详见 `docs/agent-bridge-r115-web-provider-usage-progress.md`。

> 2026-08-10 R114 Provider usage details App 闭环：Agent Home Provider Usage 区新增强类型 details 列表，展示 Provider 返回的套餐/账户附加信息；parser 与 Hypium 测试覆盖 key、label、value，空字段安全降级为 unavailable，并通过 i18n updater 写入中英文资源。`check:r87`、`check:r88`、`check:r104`、Bridge 全量 `npm --prefix tools/agent-bridge run check`、资源校验、`git diff --check` 和 SDK 23 `assembleHap --no-daemon --stacktrace` 均通过；HAP 14,478,157 bytes，SHA-256 `9FB8DE1EE659964E2B3BE74A10065669AB443C5EA787C19D17B88C6E1CD36982`。未安装、启动或测试设备；真实 Provider quota/账单、长会话和真机 Usage/Diagnostics 仍待现场验收，第 22、34 项保持“部分实现”。详见 `docs/agent-bridge-r114-provider-usage-details-progress.md`。

> 2026-08-10 R113 Browser App workspace-file upload selection：Agent Home Browser action 面板新增强类型 `AgentHomeBrowserUploadPolicy`，只有当前 `hostProfile/workspace` 已知文件列表中的普通文件才能通过“使用已选工作区文件”填充 upload action；相对路径统一拒绝绝对路径、URI、`.`、`..`、空段和跨 workspace 条目，Bridge 继续执行 realpath、符号链接、大小和摘要校验。新增 Hypium policy 测试并注册到 `List.test.ets`；三份 i18n JSON 解析、`npm --prefix tools/agent-bridge run check:browser`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过。HAP 14,481,212 bytes，SHA-256 `5931E5EE0B74A9E1E5552C81F67896736979192B452D508B5D45BCC27EB9F6F8`。未安装、启动或测试设备；受支持平台 host、真实上传/下载、恶意页面、登录态和 HarmonyOS App 全量动作仍是第 16、23D 的现场验收门。

> 2026-08-10 R108 Browser platform adapter fail-closed boundary：`browser-platform-host.js` 对 `isAvailable()` 探测异常统一降级为 `browser_platform_host_unavailable`，Browser manager smoke 新增 throwing adapter 断言；`npm run check:browser` 与 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 均退出码 0，Docker runtime 按 opt-in 规则 skipped，`git diff --check` 无实际错误。本轮未修改 ArkTS/HAP、未安装设备；真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍为第 16、23D FIELD 门。详见 `docs/agent-bridge-r108-browser-platform-adapter-fail-closed-progress.md`。

> 2026-08-10 R109 Voice PCM/raw buffer cleanup：`VoicePlatformFacade` 远程 PCM/raw 播放将 renderer 写入与 `drain()` 放入 `try/finally`，成功和异常路径均清零 renderer 复制缓冲与局部 `decoded`；Voice contract smoke 增加 drain 后顺序断言。`npm run check:voice-platform`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 14,457,721 bytes，SHA-256 `86143C940328ACD75FE717FC7B4500E735C7271B18FA7E9E5A498E256CE4D490`。未安装、启动或测试设备；真实 Provider 与真机音频现场仍待验收，第 21、33 继续保持“部分实现”。详见 `docs/agent-bridge-r109-voice-buffer-cleanup-progress.md`。

> 2026-08-10 R107 Fleet rolling interrupted-state persistence：新增 `AgentHomeDaemonFleetRunStore`，rolling 运行记录使用版本化 settings 持久化；App 重启读取旧 `running` 记录时归一化为 `interrupted/app_restarted`，恢复 completed/failed/pending/excluded 明细但不自动继续，损坏记录安全降级。新增 Hypium codec 测试并注册到现有测试列表；SDK 23 HAP 构建（14,457,913 bytes，SHA-256 `D64245358126016E35BC34FA26E56491C3348CEAD677FBC67A7A2E35EC392DB7`）和 `git diff --check` 通过。本轮未安装、启动或测试设备；真实 App 重启、跨平台 daemon、自启升级回滚和双 Bridge rolling 仍为第 14 项 FIELD 门。详见 `docs/agent-bridge-r107-fleet-interrupted-state-progress.md`。

> 2026-08-10 R106 Fleet lifecycle interruption guard：新增 `AgentHomeDaemonFleetRunControl`，页面销毁或 host 切换会取消当前 rolling run；coordinator 在步骤边界停止后续 executor，并返回 `status=interrupted`、`interruptionReason`、completed/pending 分组，不自动继续或把最后一步误报为 completed。新增 Hypium 测试覆盖步骤间取消和最后一步取消边界；SDK 23 HAP 构建（14,434,278 bytes，SHA-256 `26B0F2E53BD1D65CF24973F7B79E39B48807D01E8CEAA5FC568B9FB39B45A3F7`）通过，未安装设备。跨平台 daemon、自启/升级回滚和双 Bridge rolling 仍是第 14 项 FIELD 门。详见 `docs/agent-bridge-r106-fleet-interruption-progress.md`。

> 2026-08-10 R105 Fleet cancellation result integrity：`AgentHomeDaemonStepExecutionResult` 现在保留 Bridge action 的 `failureCategory`，Fleet coordinator 将 host lifecycle/连接池停止产生的 `cancelled` 结果向上传播，而不是误归类为普通 `failed`；当前步骤仍首错停止，后续实例保持 `pending`。新增 Hypium 纯逻辑测试覆盖取消状态与 pending 保留；SDK 23 HAP 构建（14,428,871 bytes，SHA-256 `F4C64585B47CAF0360AAEE09029B2ECA9FDB305D26E7E2685DF90A09A91F169B`）、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 本轮通过。未安装、启动或测试设备；跨平台 daemon、自启/升级回滚和双 Bridge rolling 仍是第 14 项 FIELD 门。详见 `docs/agent-bridge-r105-fleet-cancellation-progress.md`。

> 2026-08-10 R103 Browser warning URL redaction：`BrowserAutomationManager.sanitizeCapabilityWarningText()` 改为匹配所有 `scheme://` URL；HTTP/HTTPS/WS/WSS 保留兼容 `[url]` marker，`file://`、`ssh://`、`ftp://` 等非支持协议同样不再公开路径、authority、凭证或查询参数。manager/live/CDP/event scope 定向 smoke、`npm --prefix tools/agent-bridge run check:browser`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均通过。本轮未修改 ArkTS/HAP、未安装设备；真实 desktop/platform host、HarmonyOS App 全量动作、上传下载、恶意页面和登录态仍是第 16、23D FIELD 门。详见 `docs/agent-bridge-r103-browser-warning-redaction-progress.md`。

> 2026-08-10 R102 Diagnostics URL/credential redaction：`redactDiagnosticText()` 现在覆盖 HTTP/HTTPS、WS/WSS、`file://` URL、URL 内凭证、Bearer/Basic、access/refresh token、API key、client secret、authorization、cookie 和私钥路径；网络 URL 只保留无凭证 origin marker，文件 URL 使用稳定脱敏 marker。新增 diagnostics smoke 断言 wss/ws/file、URL 凭证和字段凭证；定向 diagnostics/Agent Experience smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均通过。本轮未修改 ArkTS/HAP、未安装设备；真实 Provider、长会话 compaction、真机 Usage/Diagnostics 和跨平台安全存储仍待 FIELD，第 22、34、16 项保持“部分实现”。详见 `docs/agent-bridge-r102-diagnostics-redaction-progress.md`。

> 2026-08-10 R101 Browser live action capability contract：修正 `check-browser-automation-live-smoke.js` 对未声明 `drag` 动作的旧断言；当前 `BrowserAutomationManager` 在 preview 阶段按显式 host action capability fail-closed，返回 `browser_action_unavailable`，不创建 `planId`，也不进入 confirm。实际执行 `npm run check:browser` 通过（manager、event scope、CDP、live automation、protocol alignment）；随后使用 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 通过，Docker runtime 仍按 opt-in 规则 skipped；`git diff --check` 仅有既有换行提示，无实际空白错误。本轮未修改 ArkTS/HAP，未安装设备；本机未发现可用 Chromium/Edge 宿主，因此真实 desktop/platform host、HarmonyOS App 全量动作、上传下载、恶意页面、登录态和长流仍是第 16、23D 的 FIELD 门。

> 2026-08-09 R100 Provider runtime descriptor gate：`providerRuntimeEnabled()` 统一拒绝 `runtimeConfigError` 与 `runtimePreference=exec` 的 Provider runtime；`withProviderUsageCapability()`、`ProviderRegistry.hasUsageEvents()` 和 `hasMetadataGeneration()` 共用该判定，descriptor 与 `serverInfo.features` 不再被静态 usage/metadata 声明误开。blocked runtime smoke 已加入 `check-provider-runtime-capability-smoke.js`；`npm run check:r78`、Node syntax 与定向 smoke 本轮通过。未修改 ArkTS/HAP，未连接、安装或操作设备；真实 Provider quota/账单、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R99 App Provider usage-events capability gate：`AgentBridgeProviderOption` 增加可选 `usageEventsCapabilityKnown`，parser 记录 descriptor 是否显式发布 `capabilities.usageEvents`；Agent Home `supportsUsageEvents()` 在新 Bridge 上同时校验当前 Provider capability，旧 Bridge 缺字段仍按旧全局 feature 行为。`AgentBridgeM5Parser.test.ets` 增加新/旧 descriptor 断言；本轮 `git diff --check` 无实际空白错误。未执行 ArkTS/HAP 构建或设备操作；真实 Provider usage producer、quota/账单、长会话 compaction 和真机 Usage/Diagnostics 仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R98 Provider runtime capability gates：`ProviderRegistry.hasUsageEvents()` 与 `hasMetadataGeneration()` 新增运行时聚合；`serverInfo.features.usageEvents`/`metadataGeneration` 不再由静态 catalog 误开。descriptor normalization 同时要求 metadata 方法与声明、usage producer marker，invalid Codex runtime 和 `exec` fallback 保持 false；安全 HTTPS endpoint-only Provider 继续只发布 `providerUsage`。新增 `check-provider-runtime-capability-smoke.js` 覆盖无能力、Mock 能力、invalid runtime、HTTP/凭证 endpoint；`check:r28`、`check:r76`、`check:r81`、`check:r87`、`check:r88`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 与 `git diff --check` 本轮通过。Docker runtime 按 opt-in 规则 skipped；本轮未修改 ArkTS/HAP，未连接、安装或操作设备。该子阶段只修正 capability 静态误报，真实 Provider quota/账单、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 仍待 FIELD，第 22、34 项保持“部分实现”。

> 2026-08-09 R96 Voice remote sample format：Bridge Voice 结果中的可选 `sampleBits` 现在由 Agent Home 原样转交 NGF media contract；`VoicePlatformFacade` 对缺省值保持 16 位，并将 8/16/24/32 位 PCM/raw 分别映射到 SDK 23 `SAMPLE_FORMAT_U8/S16LE/S24LE/S32LE`，非法深度结构化失败。Voice parser/contract smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 14,420,752 bytes，SHA-256 `9533179E1523A8C2B7F1119E2350BF7D63A34401828B018C2C707EBC45A0E275`。未连接、安装或操作任何设备；真实 Provider 音频 profile、真机路由、蓝牙/来电和长录音仍由第 21、33 项 FIELD 管理。

> 2026-08-09 R97 Encrypted settings secure master key：`EncryptedSettingsStoreFacade` 移除固定静态主密钥和普通 AppStorage 持久化，改用已有 `ngfKeyStoreManagerFacade`/AssetStoreKit 保存稳定 alias；旧 AppStorage 主密钥仅在安全存储可用时一次性迁移并清空，安全存储不可用时返回 `secure_storage_unavailable`、读写 fail closed。新增 `check-encrypted-settings-store-smoke.js` 并接入 Bridge `postcheck`；定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 本轮通过；HAP 14,429,593 bytes，SHA-256 `AD93C3589F9EAA294A34B3369C196E3C379D772A0BCD206EF78CF5639FF890CD`。未连接、安装或操作任何设备；跨平台安全存储和真机迁移仍需现场验证，第 16 项保持“部分实现”。

> 2026-08-09 R88 Web Session Experience：Web UI 新增 M5 Session Experience 区域，消费 `message.queue.*`、`usage.*` 和 `metadata.generate`；queue 支持取消/重试，Usage 展示 actual/estimated、token、费用、quota、budget、compaction 和事件明细，Metadata 支持四类 preview、编辑、复制、重新生成、Bridge cancel 与 session title 应用。新增 connection generation + host/workspace/agent/session scope 校验，防止迟到刷新污染新会话；旧 Bridge 缺 feature/字段时隐藏增强区。R88 定向 smoke、Web contract/live、multi-tab scope、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP，未安装设备。真实 Provider、旧 Bridge、双标签/长流和 HarmonyOS App 现场仍为第 22、34、23B 的 FIELD 门。

> 2026-08-09 R91 Daemon Fleet App 聚合摘要：新增强类型 `AgentHomeDaemonFleetSummary` 与版本分布模型；Fleet 面板现在展示实例总数、健康状态聚合、Bridge/config 版本分布、告警实例数和缺失心跳数，并在实例行展示最近心跳。旧 Bridge/不可达实例仍只读计入摘要，不进入 rolling target；新增 Hypium 纯逻辑测试覆盖状态、版本、告警和心跳缺口。资源 JSON、Bridge 全量 `npm run check`、SDK 23 HAP 构建和 `git diff --check` 均通过；HAP SHA-256 `F6B929E21979DF4ECCDCB2B8CDB95E116005FF9F26BC96AB9661BB45F2EF52C1`。Windows/Linux/macOS、自启/升级回滚、双 Bridge rolling 和指定设备现场仍待验收，第 14 项保持“部分实现”。

> 2026-08-09 R92 Browser host warning 公共边界：`normalizeCapabilityWarnings()` 在 Browser host 注册入口对 URL、Windows/Unix 绝对路径、Bearer/token/password 等 credential 片段做稳定占位符脱敏，保留普通诊断文本和数量上限；新增 manager smoke 泄露断言，Bridge 全量检查会通过既有 Browser manager precheck 执行。源码阶段不修改 `browserPlatformHost=false`，真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R93 Browser `page.logs` 公共 DTO 脱敏：Bridge manager 对外部 host 日志执行递归 allowlist、敏感键过滤、URL/路径/credential 文本脱敏以及条数/深度/键数/UTF-8 大小限制；manager smoke 覆盖 URL、绝对路径、Bearer、headers 和错误文本不泄露。`npm run check:browser` 通过；Bridge 全量 check 将在本轮修改后重新执行。平台 host、恶意页面、登录态、上传下载、HarmonyOS App 全量动作、多标签和长流仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R94 Browser host 结果递归脱敏：`BrowserAutomationManager.copyHostResult()` 现在对所有外部 host result 执行递归公开 DTO 过滤，嵌套 headers/cookies/token/password/private-key/cwd/args/env/path 等敏感键不再穿透；HTTP(S)/about:blank URL 移除凭证并删除敏感查询参数，其他 URL/协议不公开；深度、键数、数组条目和 UTF-8 文本受限。manager smoke 新增 page list 嵌套泄露断言，`check:browser`、Browser CDP/live/protocol smoke 和 Bridge 全量 `npm run check` 本轮均通过。未修改 ArkTS/HAP，未安装设备；受支持平台 host、真实上传下载、恶意页面、登录态、HarmonyOS App 全量动作、多标签和长流仍待 FIELD，第 16、23D 保持“部分实现”。

> 2026-08-09 R95 Browser 平台 Host 适配器边界：新增 `browser-platform-host.js` 适配器契约；`harmonyos` 或 `capabilitySource=platform` 的 host 注册必须通过适配器可用性和注册校验，默认 Bridge 使用不可用适配器并返回 `browser_platform_host_unavailable`，不会把客户端自报 metadata 当成平台实现。`serverInfo.features.browserPlatformHost` 改为由适配器可用性派生，公开 host DTO 增加可选 `platformHost` 标识；注入测试适配器后的受控注册和默认拒绝已由 Browser manager/protocol smoke 覆盖，`check:browser` 已纳入新模块语法检查。本轮未修改 ArkTS/HAP、未安装设备；真实 HarmonyOS/受支持平台 adapter、App 全量动作、上传下载、恶意页面、多标签和长流仍待 FIELD，第 16、23D 保持“部分实现”。

## 总目标

持续依据 `docs/agent-bridge-paseo-alignment.md` 和当前工作区实际源码，逐个收口仍为“部分实现”的能力。每个阶段必须形成真实的协议、Bridge、调用端和自动化处理链，并把源码证据、命令结果和现场依赖分开记录。不得以 feature flag、模型字段、占位 UI 或历史测试记录宣称能力已经完成。

当前清单基线：36 项中 29 项已实现、7 项部分实现、0 项未实现。部分实现项为 14、16、21、22、23、33、34；第 23 项继续拆分为 Docker、Web UI、Service Proxy、Browser Automation 子边界。

## 当前阶段顺序

| 阶段 | 范围 | 状态 | 完成门 |
|---|---|---|---|
| R6-WEB-1 | Web UI 现有 session/workspace/chat/结构化 Git-Diff/notification/diagnostics 基础 | 已完成 | contract/live smoke 已执行并接入 `precheck`；旧 Bridge fallback 保留 |
| R6-WEB-2 | 终端 binary 流、输入/resize/backpressure/恢复、Git/Diff 写操作、文件浏览/下载、settings/doctor 分组、GitHub 工作台 | 已完成（源码） | terminal/files/Git 写操作/settings/doctor/GitHub OAuth、binding、PR/checks/watch/attachment 已形成真实 RPC 闭环，并通过 Web contract/live/GitHub smoke 与全量 `npm run check`；现场门继续由 R6-WEB-3/FIELD 管理 |
| R6-WEB-3 | 多标签、旧 Bridge、长流和浏览器现场工作台 | 进行中（现场） | Web 源码控制面已完成；多标签、旧 Bridge、长流和真实浏览器现场仍待实测 |
| R7-HOST | 受支持平台 Browser host 与完整 App/Web 控制面 | 源码已完成，现场待验 | Bridge/CDP、Web host 选择与完整页面动作已接线；HarmonyOS App 全量动作、受支持平台 host 和现场 smoke 仍待补 |
| R8-APP-BROWSER | HarmonyOS App Browser 请求关联与截图预览 | 已完成（源码） | parser、App pending lifecycle、截图 MIME/大小限制、Browser 定向 smoke、Bridge 全量 check 与 SDK 23 构建已执行；完整 App 动作和真实 host 仍由 R7/FIELD 管理 |
| R116-WEB-BROWSER-SCREENSHOT | Web Browser screenshot 受限预览与生命周期清理 | 已完成（源码子阶段） | Web compatibility、Bridge manager DTO、Web `<img>` 预览、host/page/断线清理和 `check:r116` 已完成并通过；真实平台 host、恶意页面、登录态和 App 全量动作仍由 FIELD 管理 |
| R9-USAGE-SCOPE | Usage 事件 host 隔离与持久恢复 | 已完成（源码） | usage scope/recovery smoke 已接入 Bridge `check`；真实 Provider quota、metadata、长会话和现场数据仍由 FIELD 管理 |
| R10-WEB-LIFECYCLE | Web 连接生命周期、刷新竞态与重新登录 | 已完成（源码） | Web contract/live 与 Bridge 全量 `npm run check` 本轮通过；真实双标签、旧 Bridge、长流和浏览器现场继续由 FIELD 管理 |
| R11-WEB-WORKSPACE-REGISTRY | Web workspace registry import/open/archive | 已完成（源码） | Web contract/live 与 Bridge 全量 `npm run check` 本轮通过；真实浏览器、多标签、旧 Bridge 和长流继续由 FIELD 管理 |
| R12-USAGE-METADATA-SCOPE | Usage quota endpoint 与 metadata 作用域安全收口 | 已完成（源码子阶段） | metadata scope、Provider HTTPS usage endpoint、定向 smoke 与协议兼容 smoke 已通过；真实 Provider quota/metadata/长会话和 App/真机现场仍由 FIELD 管理 |
| R13-WEB-LEGACY-COMPAT | Web 旧 Bridge、缺字段、未知事件和可选 RPC 兼容归一化 | 已完成（源码） | compatibility smoke、Web contract/live smoke 和 `check:r13` 已通过；真实旧 Bridge、多标签、长流和浏览器现场仍由 R6-WEB-3/FIELD 管理 |
| R14-VOICE-CONTRACT | Voice endpoint 安全与本地/远程 capability 语义 | 已完成（源码子阶段） | Voice endpoint/capability smoke、Bridge 全量 `npm run check` 与 SDK 23 `assembleHap` 本轮通过；仅向 `5KLBB25A10203862` 尝试安装，因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；真机音频路由和真实 Provider 仍由 FIELD 管理 |
| R15-USAGE-METADATA-CONTRACT | Provider usage unavailable/redirect 安全与 metadata alternatives 契约 | 已完成（源码子阶段） | Provider usage、endpoint、Codex App Server metadata smoke 本轮通过；真实 Provider quota/长会话/现场 App 数据仍由 FIELD 管理 |
| R16-BROWSER-RESULT-INTEGRITY | Browser host 结果信封完整性与原型污染边界 | 已完成（源码子阶段） | Browser manager/CDP/live/protocol smoke 与 Bridge 全量 `npm run check` 本轮通过；平台 host、HarmonyOS App 全量动作和真实浏览器现场仍由 R7/FIELD 管理 |
| R94-BROWSER-PUBLIC-RESULT-REDACTION | Browser host 结果递归脱敏 | 已完成（源码子阶段） | manager/CDP/live/protocol smoke、`npm run check:browser` 与 Bridge 全量 `npm run check` 本轮退出码 0；平台 host、HarmonyOS App 全量动作和真实浏览器现场仍由 R7/FIELD 管理 |
| R95-BROWSER-PLATFORM-HOST-ADAPTER | Browser 平台 host 注册适配器边界 | 已完成（源码子阶段） | 默认适配器拒绝平台 host，注入测试适配器可受控注册；manager/protocol smoke 与 `npm run check:browser` 本轮通过；真实 HarmonyOS/平台 adapter、App 全量动作和现场浏览器能力仍由 R7/FIELD 管理 |
| R101-BROWSER-LIVE-ACTION-CAPABILITY | Browser live smoke 与显式 action capability 语义 | 已完成（源码验证） | 未声明 action 在 preview 阶段返回 `browser_action_unavailable` 且不生成 plan；`npm run check:browser` 与本次 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0；真实 desktop/platform host、HarmonyOS App 和现场浏览器仍由 R7/FIELD 管理 |
| R96-VOICE-REMOTE-SAMPLE-FORMAT | Voice 远程 PCM/raw 采样深度端到端传递 | 已完成（源码子阶段） | Voice parser/contract smoke、Bridge 全量 check、SDK 23 HAP 构建与 `git diff --check` 本轮通过；HAP SHA-256 `9533179E1523A8C2B7F1119E2350BF7D63A34401828B018C2C707EBC45A0E275`；未连接或操作设备；真实 Provider profile、真机路由和蓝牙/来电仍由第 21、33 FIELD 管理 |
| R109-VOICE-PCM-BUFFER-CLEANUP | Voice 远程 PCM/raw 播放敏感缓冲清理 | 已完成（源码子阶段） | `npm run check:voice-platform`、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 本轮通过；HAP SHA-256 `86143C940328ACD75FE717FC7B4500E735C7271B18FA7E9E5A498E256CE4D490`；未安装、启动或测试设备；真实 Provider profile、真机路由和蓝牙/来电仍由第 21、33 FIELD 管理 |
| R97-ENCRYPTED-SETTINGS-SECURE-MASTER-KEY | 加密设置安全主密钥托管与旧值迁移 | 已完成（源码子阶段） | `check-encrypted-settings-store-smoke.js`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP 构建和 `git diff --check` 本轮通过；HAP SHA-256 `AD93C3589F9EAA294A34B3369C196E3C379D772A0BCD206EF78CF5639FF890CD`；未连接或操作设备 | 跨平台 AssetStore/Keychain/Secret Service 行为、历史数据迁移和真机安全存储仍需 FIELD，第 16 项继续保持“部分实现” |
| R17-REMOTE-CONFIG-URL-INTEGRITY | Daemon 远程配置 URL 与重定向输入边界 | 已完成（源码子阶段） | remote-config smoke 与 Bridge 全量 `npm run check` 本轮通过；跨平台安装、自启、rolling 和真实签名配置仍由 FIELD 管理 |
| R18-VOICE-REMOTE-CAPTURE-ISOLATION | Voice remote STT 与本地 CoreSpeechKit 识别引擎隔离 | 已完成（源码子阶段） | Voice platform contract/manager smoke、Bridge 全量 `npm run check` 与 SDK 23 HAP 构建通过；指定设备安装因签名 profile 未授权 UDID 失败，真机音频路由和真实 Provider 仍由 FIELD 管理 |
| R19-FLEET-TARGET-INTEGRITY | Daemon Fleet rolling 目标实例、host 与 generation 完整性 | 已完成（源码子阶段） | target-guard smoke、Bridge 全量 `npm run check` 与 SDK 23 HAP 构建本轮通过；指定设备安装尝试因签名 profile 未授权 UDID 返回 `9568423`，双 Bridge/跨平台 rolling 仍由 FIELD 管理 |
| R45-BROWSER-EVENT-SCOPE | Browser lifecycle event owner 单播与跨连接隔离 | 已完成（源码子阶段） | Browser event scope smoke、Browser manager smoke、Bridge 全量 `npm run check`（含 precheck/check/postcheck）与 `git diff --check` 通过；真实平台 host、HarmonyOS App 全量动作和浏览器现场仍由 FIELD 管理 |
| R46-SERVICE-EVENT-SCOPE | Workspace Service lifecycle event owner 单播与断开清理 | 已完成（源码子阶段） | Service event scope smoke、Service Proxy manager smoke、Bridge 全量 `npm run check`（含 postcheck）与 `git diff --check` 均通过；真实域名、跨 host/workspace 权限、长代理和服务进程现场仍由 23C/FIELD 管理 |
| R47-AUTOMATION-EVENT-SCOPE | Schedules、Loops、Chat Rooms 事件订阅隔离 | 已完成（源码子阶段） | automation event scope smoke、三个 manager smoke、Bridge 全量 `npm run check`（含 postcheck）与 `git diff --check` 均通过；真实多连接 App、权限变化、daemon 重启重新订阅和长时间运行仍由 FIELD 管理 |
| R48-FILE-TRANSFER-EVENT-SCOPE | 文件上传/下载生命周期事件 owner 单播 | 已完成（源码子阶段） | file transfer event scope、terminal/file IO smoke、Node 语法检查、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均退出码 0；真实大文件、弱网和 App 多连接仍由 FIELD 管理 |
| R49-TERMINAL-EVENT-SCOPE | Terminal lifecycle event owner/subscriber 单播 | 已完成（源码子阶段） | terminal event scope、terminal/file IO smoke、Node 语法检查、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均退出码 0；真实长流、弱网和 App 多连接仍由 FIELD 管理 |
| R50-AUTOMATION-RUNTIME-EVENT-SCOPE | Automation Agent/session Provider runtime event workspace 单播 | 已完成（源码子阶段） | automation runtime scope、automation scope、Schedule/Loop/Chat Room manager smoke、Node 语法检查、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均退出码 0；真实长会话、多 workspace 和权限变化仍由 FIELD 管理 |
| R51-NOTIFICATION-HOST-SCOPE | Notification 持久化、RPC 和投递按 hostProfileId 隔离 | 已完成（源码子阶段） | manager 与 server 按 host 分组创建/读取/修改/清理通知；内部 automation 按 workspace 转发到真实目标连接，不写入虚构 host；notification scope smoke、既有 notification smoke、Node 语法检查、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；真实多 Host/Push 现场继续待验证 |
| R52-PUSH-HOST-SCOPE | Push subscription、delivery 和 push status 按 hostProfileId 隔离 | 已完成（源码子阶段） | Push manager/server 增加 host-scoped register/status/unregister/deliver；host notification 只发送同 host token，legacy 无 host 保持兼容；push scope smoke、既有 Push smoke、Node 语法检查、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；真实 AGC/真机 Push 现场继续待验证 |
| R53-GITHUB-HOST-SCOPE | GitHub OAuth、binding、PR plan、附件 plan 与 watch 按 hostProfileId 隔离 | 已完成（源码子阶段） | GitHub host scope smoke、GitHub client smoke、Node 语法检查、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；真实 GitHub 多账号/资产服务现场继续待验证 |
| R54-GITHUB-CREDENTIAL-STORE | GitHub OAuth credential store 安全执行与全量回归 | 已完成（源码子阶段） | credential store 定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0；macOS/Linux/真实 OAuth 仍为 FIELD |
| R55-GITHUB-OAUTH-SESSION | OAuth Device Flow session 过期/终态错误清理 | 已完成（源码子阶段） | GitHub host scope smoke 已覆盖本地 OAuth mock、过期和 `access_denied`；`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 退出码 0；真实 GitHub OAuth 仍为 FIELD |
| R56-GITHUB-WEBSOCKET-HOST-SCOPE | GitHub RPC/plan/watch 的真实 WebSocket host scope | 已完成（源码子阶段） | 真实 Bridge 双 WebSocket smoke 验证 binding、OAuth poll、PR plan、watch stop 和断线清理；`npm run check:github-host-scope-live`、Bridge 全量 check 与 `git diff --check` 均通过；真实 GitHub/多 Host App/限流/资产服务仍为 FIELD |
| R57-DAEMON-REMOTE-CONFIG-HOST-SCOPE | Daemon remote config plan 与 WebSocket host scope | 已完成（源码子阶段） | 真实 Bridge 双 WebSocket smoke 验证 status scope、跨 host apply/rollback 阻断、同 host confirm 和 source/configVersion 变化后的 plan 失效；`check:daemon-remote-config-host-scope-live` 已接入 `postcheck`；跨平台 daemon、真实签名配置和双 Bridge rolling 仍为第 14 项 FIELD 门 |
| R58-DAEMON-CONFIG-CLI-MCP | Daemon remote config CLI/MCP live-only 与风险确认 | 已完成（源码子阶段） | management CLI live smoke、MCP live smoke、Node 语法检查和 Bridge 全量 check 本轮通过；CLI 无 live Bridge 返回 `live_bridge_required`，MCP fetch 为 open-world、preview/status/validate 为只读、apply/rollback 缺 confirm 在触达 Bridge 前阻断；跨平台 daemon、真实签名配置和双 Bridge rolling 仍为第 14 项 FIELD 门 |
| R59-USAGE-CURRENCY-INTEGRITY | Usage 费用币种与 unavailable 语义 | 已完成（源码子阶段） | `UsageManager` 仅聚合带有效 `currency` 的费用，币种统一大写；缺少币种的 cost 保留事件但不进入费用 summary；定向 normalization smoke、Bridge 全量 check 和 `git diff --check` 已通过；真实 Provider 账单币种、quota、长会话与真机展示仍为第 22/34 项 FIELD 门 |
| R60-APP-USAGE-CURRENCY-PARSER | App Usage 费用币种 parser 与 Bridge 语义一致 | 已完成（源码子阶段） | App parser 拒绝空币种费用并规范化 event/budget/warning currency；M5 parser tests 已注册，SDK 23 HAP 构建退出码 0（SHA-256 `E617B8A8289F177AFF0A1421FA9D4DE00D98E352331EB9B3AC01FEC845B61E1D`）；真实 Provider 账单与真机展示仍为第 22/34 项 FIELD 门 |
| R61-APP-QUOTA-WINDOW | App quota window 保留与展示 | 已完成（源码子阶段） | `AgentBridgeUsageQuotaRecord` 保留 session/day/month window，quota 卡复用现有窗口标签展示；M5 parser test 已注册，SDK 23 HAP 构建退出码 0（SHA-256 `342C96A98AB5B205EBC0F1B08D9106AB2A6B4F84E9040AC49033A0195477D22F`）；真实 Provider window 语义与真机展示仍为第 22/34 项 FIELD 门 |
| R62-BUDGET-CURRENCY-INTEGRITY | Bridge budget currency 规范化与告警匹配 | 已完成（源码子阶段） | `UsageManager.record()` 与 `budgetSet()` 统一 event/budget currency 的 trim/大写；normalization smoke 覆盖 lowercase budget/event 与 cost warning，`check:r62` 已进入 postcheck，Bridge 全量 check 和 `git diff --check` 本轮通过；真实 Provider 账单仍为第 22/34 项 FIELD 门 |
| R63-BUDGET-CURRENCY-MIGRATION | 已持久化 budget currency 幂等迁移 | 已完成（源码子阶段） | Bridge 启动读取 v2 budget 时幂等规范化旧小写 currency；迁移 normalization smoke、Bridge 全量 check 和 `git diff --check` 已通过；真实 Provider 账单仍为 FIELD |
| R64-PROVIDER-USAGE-CAPABILITY | Provider usage descriptor 与 App capability gate | 已完成（源码子阶段） | Registry/catalog 统一发布可选 `capabilities.providerUsage`；App 对显式 false 隐藏 quota 刷新入口，旧 Bridge 缺字段保持旧行为；Provider runtime capability smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 已通过；HAP 仅向 `5KLBB25A10203862` 尝试安装并因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；真实 Provider quota 与真机展示仍为第 22/34 项 FIELD 门 |
| R65-WEB-MULTITAB-SCOPE | Web 多标签 endpoint/host scope 与局部刷新 | 已完成（源码子阶段） | BroadcastChannel 事件增加 endpoint/hostProfileId/payload scope 过滤；workspace/session/scope 事件只刷新当前相关状态；定向 smoke、Web compatibility/UI contract、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 与 `git diff --check` 均退出码 0；真实多标签、旧 Bridge、长流和 WebView 仍为 23B FIELD 门 |
| R66-PROVIDER-USAGE-SCOPE-INTEGRITY | Provider usage response scope 权威化 | 已完成（源码子阶段） | Provider usage 请求的 host/session/agent/window 作用域覆盖不可信 Provider 响应，冲突返回稳定 `provider_scope_response_ignored` warning；定向 scope integrity smoke、R30 freshness smoke、Bridge 全量 check（含 postcheck）和 `git diff --check` 均通过；真实 Provider quota、长会话和真机展示仍为第 22/34 项 FIELD 门 |
| R76-PROVIDER-USAGE-PRODUCER-INTEGRITY | Codex/OpenCode/Gateway usage producer 缺失字段与非法数值语义 | 已完成（源码子阶段） | 三类 normalizer 仅在 input/output 双侧存在时推导 total，负数/分数/超安全范围 token 与负数/非有限 cost 保持 unavailable，缺 currency 不伪造 `USD`；新增跨 Provider producer integrity smoke，`check:r76` 已接入 `postcheck`。本轮 Node/Bridge-only，真实 Provider 账单、quota、长会话和真机展示仍为第 22/34 项 FIELD 门 |
| R78-PROVIDER-CAPABILITY-INTEGRITY | Provider usageEvents/providerUsage/metadataGeneration 运行时 capability 门控 | 已完成（源码子阶段） | Registry 已把静态声明与 runtime method/producer marker 对齐，并拒绝不安全 usage endpoint；R78 smoke 已接入 `postcheck`；本轮 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，真实 Provider/现场门仍由第 22/34 项管理 |
| R20-BROWSER-ACTION-PREVIEW-SNAPSHOT | HarmonyOS App Browser action Preview/Confirm 目标快照一致性 | 已完成（源码子阶段） | protocol alignment、target guard、Bridge 全量 `npm run check` 与 SDK 23 HAP 构建本轮通过；真实 Browser host、HarmonyOS 全量动作和上传下载仍由 R7/FIELD 管理 |
| R23-VOICE-CAPTURE-LIFECYCLE | Voice AudioCapturer 迟到回调与 AudioSession listener 生命周期 | 已完成（源码子阶段） | Voice platform contract smoke、Bridge 全量 `npm run check` 与 SDK 23 HAP 构建本轮通过；指定设备 `5KLBB25A10203862` 为 Offline，未执行安装、启动或设备测试；真机音频路由和真实 Provider 仍由 FIELD 管理 |
| R24-VOICE-FIELD-VALIDATION | Voice RPC 输入与 Provider 输出字段校验 | 已完成（源码子阶段） | Voice manager/platform smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP 构建本轮退出码 0；HAP SHA-256 `FCBCCACB88ECB9E50606D9E8FA424DBB7DBDACF6CF0DD496EA987D53F9C9EA08`；指定设备 `5KLBB25A10203862` Offline，未安装、启动或设备测试 |
| R25-USAGE-METADATA-RESULT-INTEGRITY | Provider usage quota 与 metadata 输出完整性 | 已完成（源码子阶段） | Provider usage/metadata scope smoke 与 Bridge 全量 `npm run check` 本轮退出码 0；真实 Provider quota/metadata 与 App 现场仍由 FIELD 管理 |
| R26-METADATA-REQUEST-INTEGRITY | Metadata timeout/cancel、断开清理与请求 scope | 已完成（源码子阶段） | metadata request smoke、Bridge 全量 `npm run check`、SDK 23 `assembleHap` 本轮退出码 0；HAP SHA-256 `4D0C10F68CC4C2C164AD532B902B21EE7F6DE55CAA34E6C954A4B78D3CF2D753`；指定设备 Offline，未安装、启动或测试 |
| R27-METADATA-WS-DISCONNECT | 真实 WebSocket 断开后的 metadata pending 清理 | 已完成（源码子阶段） | `metadata request disconnect smoke` 使用真实 `/ws`、主动断开、daemon status unregister 和新连接复用 requestId；R26/R27 定向 smoke 与 Bridge 全量 `npm run check` 本轮退出码 0 |
| R28-USAGE-METADATA-LIVE | Usage/Metadata Bridge 端到端 scope 与生命周期回归 | 已完成（源码子阶段） | Mock Provider 驱动的 WebSocket live smoke、agentId 权威补齐和 Bridge 全量 `npm --prefix tools/agent-bridge run check` 均退出码 0；真实 Provider/真机仍由 FIELD 管理 |
| R29-USAGE-EVENT-NORMALIZATION | Usage 事件数值边界与 unavailable 语义 | 已完成（源码子阶段） | UsageManager 统一拒绝负数/非安全整数 token、quota、compaction 与负 cost；单侧 token 不推导 total；定向 smoke、usage recovery smoke、Bridge 全量 `npm run check` 均退出码 0 |
| R32-REMOTE-CONFIG-STATE-INTEGRITY | 远程配置持久状态完整性 | 已完成（源码子阶段） | schema/启动 reconcile/摘要漂移/损坏 previous/写盘失败定向 smoke、Bridge 全量 check 与 `git diff --check` 均已通过（本机使用 `system-conpty`） | 跨平台、多 Bridge rolling 和真实签名配置仍为 FIELD 门 |
| R33-VOICE-SESSION-STATE | Voice 权限、前后台、AudioSession 中断与幂等清理 | 已完成（源码子阶段） | Voice contract smoke、Bridge 全量 check、SDK 23 HAP 构建和指定设备安装尝试均已实际执行；设备安装因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试 | 真机权限撤销、耳机/蓝牙、来电抢占、弱网长录音和真实 STT/TTS 仍为 FIELD 门 |
| R34-COMPATIBILITY-PROTOCOL-SUMMARY | Diagnostics/Compatibility 协议版本摘要 | 已完成（源码子阶段） | Bridge compatibility builder、diagnostics smoke、App parser/UI 变更、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 均已通过；HAP SHA-256 `730A331A6A8BEAEEDF20D4CA3EC0B809474D2ABA6FFC4FE16BC4AF97CF5F5089`；仅向 `5KLBB25A10203862` 安装一次，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试 | 真实旧 Bridge、现场版本矩阵和真机展示仍为 FIELD 门 |
| R35-COMPATIBILITY-MATRIX | 旧 Bridge minimum-only 协议兼容矩阵 | 已完成（源码子阶段） | compatibility matrix、diagnostics、Agent Experience smoke 和 Bridge 全量 check（含 `postcheck`/`check:r35`）均退出码 0；本轮未修改 ArkTS，不重复构建或安装 HAP | 真实旧/新 Bridge 版本矩阵和真机兼容卡仍为 FIELD 门 |
| R36-BROWSER-APP-CAPABILITY | Browser App host capability/readiness 与错误边界 | 已完成（源码子阶段） | ArkTS parser/model 进入 SDK 23 编译并通过；`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 退出码 0；HAP `entry/build/default/outputs/default/entry-default-signed.hap` 14,246,450 bytes，SHA-256 `F15C24A2F0A8BC393F5292984EDB0C317960874D209EE945ECA5BBF795E39461`；仅向 `5KLBB25A10203862` 安装尝试，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试；`git diff --check` 退出码 0 | 真实平台 host、上传下载、恶意页面/登录态、多标签长流和真机 Browser 全量动作仍为 FIELD 门 |
| R39-VOICE-TTS-CLIENT-CORRELATION | 远程 TTS App/Bridge clientRequestId 关联与迟到结果隔离 | 已完成（源码子阶段） | Voice manager/protocol 定向 smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 通过；HAP SHA-256 `5EA2E28465CA69451AD6B1CA30DB7EFFB2CD2E862EAA272F6C90EFDEBC4D9C40`；仅向 `5KLBB25A10203862` 尝试安装，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试 | 真实 Provider 取消/超时、弱网、音频路由、蓝牙/来电、权限状态和长录音仍为 FIELD 门 |
| R40-MESSAGE-QUEUE-ATTEMPT | Message queue retry attempt 完整性与持久恢复 | 已完成（源码子阶段） | Agent Experience smoke、Bridge 全量 `npm run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace` 均通过；ArkTS 构建仅保留既有 syscap/弃用/异常声明警告；本轮未安装、启动或测试设备 | 真实 Provider cancel/并发策略、长时间弱网和真机队列展示仍属于既有 M5/现场门 |
| R41-DAEMON-STATUS-GENERATION | Agent Home daemon status request/instance/generation 完整性 | 已完成（源码子阶段） | `AgentHomeDaemonStatusCoordinator` 测试已注册；SDK 23 `assembleHap --no-daemon --stacktrace`、Bridge 全量 `check`、Hvigor tasks 和 `git diff --check` 均通过；本轮未安装、启动或测试设备 | 跨平台 daemon、双 Bridge rolling、真实 heartbeat/健康聚合仍属于第 14 项 FIELD 门 |
| R42-BROWSER-REQUEST-SCOPE | Browser App request/host/instance/page scope 完整性 | 已完成（源码子阶段） | `AgentHomeBrowserRequestCoordinator` 测试已注册；SDK 23 HAP 构建、Browser 定向 smoke 和 `git diff --check` 通过；本轮未安装、启动或测试设备 | 真实平台 Browser host、上传下载、恶意页面和真机全量动作仍属于第 16/23D FIELD 门 |
| R44-VOICE-EVENT-SCOPE | Bridge Voice 事件 owner-scoped 单播与跨连接隔离 | 已完成（源码子阶段） | Voice manager/server/router 与双连接 scope smoke 已接线；`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0；本轮未生成或安装 HAP | 真实 Provider、真机音频路由、弱网、取消和长录音仍属于第 21/33 FIELD 门 |
| R68-APP-DIFF-PAGINATION | 第 30 项 App Git/Diff 文件/行/字节分页 | 已完成（源码子阶段） | App 强类型 Diff parser/client/page、幂等持久化迁移、续页去重和截断交互已接线；workspace Git smoke（文件/行/字节分页）、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 本轮通过；HAP SHA-256 `706F131009D41F5E0D0182B2339C86B897DA3C9899FD2F49EE9223E27437EADE`；目标设备 `5KLBB25A10203862` Offline，未安装 | 真实大型仓库、二进制 Diff、弱网、真机渲染和现场 Git/GitHub 组合操作仍由 FIELD 管理；不以 smoke 替代现场 |
| R69-BROWSER-PERMISSION-STATE | 第 16、23D Browser permission 状态与下载目录脱敏 | 已完成（源码子阶段） | `publicPermissionState()`、App permission parser/UI、Browser permission event scope、Browser manager smoke、protocol alignment smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 已通过；HAP SHA-256 `10B28A1F2ABC9B5C0DFE8D4EAA0CC0E1230A2D4627C97A5E76ADFA0799BEFBB3`；目标设备 `5KLBB25A10203862` Offline，未安装 | 真实平台 Browser host、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍由 FIELD 管理；第 16、23D 继续保持“部分实现” |
| R70-VOICE-PERMISSION-SEMANTICS | 第 21、33 Voice 麦克风权限状态与 remediation 语义 | 已完成（源码子阶段） | `NGFVoicePermissionRemediation` 共享常量、授权成功清理、拒绝稳定 `permission_denied`/`open_app_permission_settings`、App 警告文案和 Voice parser/contract smoke 已通过；Bridge 全量 `check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 均通过；HAP SHA-256 `34D84AFBC3B17E6AB70F9BEFFED9D2663E9B9494E652AD2BB5E9161DF85A90C5`；目标设备 `5KLBB25A10203862` Offline，未安装 | 真机权限、蓝牙/耳机、来电抢占、前后台、弱网长录音和真实 Provider 仍由 FIELD 管理；第 21、33 继续保持“部分实现” |
| R71-BROWSER-DOWNLOAD-PATH-BOUNDARY | 第 16、23D Browser 下载路径公开边界 | 已完成（源码子阶段） | permission manager、CDP action/list、Bridge live、protocol alignment smoke 和 Node 语法检查均通过；公开只返回 `.agent-bridge-downloads` 或文件元数据，内部命令仍保留绝对路径；本阶段无 HAP/设备操作 | 真实平台 host、真实浏览器上传/下载、恶意页面/登录态和 HarmonyOS App 全量动作仍由 FIELD 管理；第 16、23D 继续保持“部分实现” |
| R73-DAEMON-PUBLIC-SURFACE | Daemon status/health/logs 公开路径与 managed process DTO 边界 | 已完成（源码子阶段） | `node --check src/server.js`、`node --check scripts/check-daemon-public-surface-smoke.js` 与临时 Bridge public-surface smoke 均退出码 0；未修改 ArkTS/HAP、未安装设备 | 第 14 项跨平台安装、自启/升级、双 Bridge rolling 与第 16/23D 的真实 host/真机安全现场仍由 FIELD 管理 |
| R74-DAEMON-UPDATE-PUBLIC-SURFACE | Daemon update status 嵌套路径与命令细节公开边界 | 已完成（源码子阶段） | `publicDaemonUpdateStatus()` 与 public-surface smoke 覆盖 daemon health/status 嵌套 update 及独立 `daemon.update.status`；Node/public-surface/supervisor live smoke、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check` 均退出码 0 | 第 14 项跨平台安装、自启/升级、双 Bridge rolling 与第 16/23D 现场门不变 |
| R85-APP-QUOTA-EVENT-WINDOW | App Usage event quota 自定义窗口语义 | 已完成（源码子阶段） | App parser 事件归一化与 M5 parser 断言已补齐；R82/R83/R79/R30 定向回归、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP 构建和 `git diff --check` 本轮通过；HAP SHA-256 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`；本轮未安装设备 | 真实 Provider 自定义 quota、长会话、Usage/Diagnostics 真机展示仍属第 22、34 项 FIELD 门 |
| R86-DAEMON-FLEET-VERSION-CONFIG | Daemon Fleet rolling Bridge/config 版本校验 | 已完成（源码子阶段） | `AgentHomeDaemonFleetCoordinator`/connection pool 增加 expected/target Bridge/config 版本，restart/update/轮询结果执行版本一致性检查；新增 coordinator 版本匹配、Bridge mismatch、update target、config drift 和全排除测试；`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，`git diff --check` 通过；SDK 23 HAP 最终源码构建 `BUILD SUCCESSFUL in 37 s 336 ms`，产物大小 `14,397,504` bytes，SHA-256 `B219495A5DE9E07A4E3A090C0C7A1FF0B8FF0FACA922D47027A3DEF5233AB6E7` | Windows/Linux/macOS 全局安装、自启/升级回滚、真实双 Bridge rolling 和签名远程配置仍为 FIELD，第 14 项保持“部分实现” |
| R88-WEB-SESSION-EXPERIENCE | Web UI M5 queue/usage/metadata 消费闭环 | 已完成（源码子阶段） | `src/web/compatibility.js` 增加强类型归一化；`src/web/app.js` 增加 queue cancel/retry、Usage event/quota/budget/compaction、Metadata preview/edit/cancel 和 scope/connection-generation 防串线；R88/Web contract/live/multi-tab smoke、Bridge 全量 `check` 和 `git diff --check` 本轮退出码 0 | 真实 Provider 长会话/quota/metadata、真实旧 Bridge、双标签/长 terminal/diff、HarmonyOS App 和真机展示仍为 FIELD；第 22、34、23B 保持“部分实现” |
| R155-VOICE-AVPLAYER-STATE-MACHINE | Voice 压缩音频 AVPlayer 状态机与迟到回调隔离 | 已完成（源码子阶段） | listener-before-dataSrc、initialized gate（10s 超时一次性 settle）、prepare/play 后 generation+player+requestId 复核、release 对称注销/reject gate/仅当前 generation deactivate、completed 与 PCM drain 完成清 `ttsRequestId`（含本轮修复 PCM 残留）；`check:r155` 接入 `postcheck`，定向 smoke、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 HAP（14,540,700 bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`）和 `git diff --check` 本轮通过；未安装设备 | 真机音频路由、权限、蓝牙/耳机、来电、弱网长录音和真实 STT/TTS Provider 仍为第 21、33 项 FIELD 门 |
| R157-PROVIDER-METADATA-CAPABILITY-GATE | Provider metadata 门禁与 usageEvents 一致 | 已完成（源码子阶段） | App `supportsMetadataGeneration()` 增加 `metadataGenerationCapabilityKnown` 兼容分支（旧 Bridge 缺字段保留全局 feature，新 Bridge 按显式 capability fail-closed）；M5 parser 测试断言已扩展；SDK 23 HAP（14,545,893 bytes，SHA-256 `142E3CA295AA0B7FADC9B02A2A2107C9A8FCCDDEC0D583AC93D9F8BA828727B2`）和 `git diff --check` 本轮通过；未安装设备 | 真实 Provider metadata、长会话、quota/账单和真机 Usage/Diagnostics 展示仍为第 22、34 项 FIELD 门 |
| R156-FLEET-APP-LOCAL-AVAILABILITY | Daemon Fleet 面板 App-local 可见性与结果归属校验 | 已完成（源码子阶段） | 新增 `AgentHomeDaemonFleetAvailabilityPolicy`：面板可见性只依赖 App 本地编排能力 + 可查询 saved profiles，不再读取当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget`；Fleet 面板移出 daemon 诊断区成为独立设置 stage；collect 结果写入前按 hostProfileId 集合一致性校验；per-target `fleetTargetSupported/rollingEligible` 门与 instanceId/generation/版本校验保留；新增 Hypium policy 测试注册 `List.test.ets`；SDK 23 HAP（14,546,210 bytes，SHA-256 `83DD2A8B5AE1FAAD546600DD779494BC19E2EED280CB9D09BF650868FF4592F9`）和 `git diff --check` 本轮通过；未安装设备 | Windows/Linux/macOS 全局安装、自启重启、真实双 Bridge rolling、升级回滚和 HarmonyOS App Fleet 真机现场仍为第 14 项 FIELD 门 |
| FIELD | 14、16、21、22、33、34 及 23B/23D 的真实环境门 | 待开始 | 真机、真实 Provider/GitHub/AGC、跨平台 daemon、平台 host 的现场证据 |

## R19-FLEET-TARGET-INTEGRITY 已完成的源码子阶段

- [x] Bridge 新增 `daemon-target-guard`，restart/update/rollback 写操作校验可选的 `hostProfileId`、`expectedInstanceId` 和 `expectedGeneration`，旧客户端缺字段仍保持兼容。
- [x] Fleet App 将 host/instance/generation 身份贯穿 preview、执行、轮询和结果聚合；instance 改变或 generation 不增长时停止该步骤，首错停止并保留 completed/failed/pending 结果。
- [x] isolate/re-enable 使用本地隔离集合，刷新后的 snapshot 不会错误清除隔离状态；target guard 定向 smoke 已加入 Bridge 全量 `check`。
- [x] 本轮实际执行 target guard smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`；均无阻断错误。
- [ ] 双 Bridge A/B rolling、Windows/Linux/macOS 全局安装/自启/升级回滚和真实签名远程配置仍为现场门，第 14 项继续保持“部分实现”。

## R19 指定设备安装边界

- [x] HAP 构建成功后仅向 `5KLBB25A10203862` 执行安装尝试。
- [x] HDC 返回 `9568423`（签名 profile 未授权 UDID）；没有向其他设备安装，没有启动或测试。

## R20-BROWSER-ACTION-PREVIEW-SNAPSHOT 已完成的源码子阶段

- [x] App Browser action Preview 保存完整 `AgentBridgeBrowserPayload` 快照，Confirm 只复用该快照并替换一次性 planId/confirm，不重新读取可变 UI draft。
- [x] 取消、断开、host 切换和页面清理清除 pending action payload；Bridge 继续执行 plan digest、workspace/host/instance/page、realpath、mtime、SHA-256 和大小校验。
- [x] protocol alignment smoke 增加 action snapshot/confirm reuse 断言；本轮 SDK 23 HAP 与 Bridge 全量 check 均通过。
- [ ] 真实 platform Browser host、HarmonyOS 全量动作、恶意页面、登录态和上传/下载现场仍待 FIELD；第 16、23D 保持“部分实现”。

## R6-WEB-2 工作清单

- [x] 核对 Web UI 使用的 terminal capability 与 Bridge binary frame/terminal manager 契约。
- [x] 补 terminal subscribe/restore/output/input/resize 的 Web 状态闭环，并处理慢消费者、断线和恢复提示。
- [x] 复用 R2 Git plan manager，为 Web Git 写操作提供 preview/confirm、stale plan 和最小 scope 刷新（已覆盖 stage/unstage/commit/pull/push/branch/stash/merge/discard）。
- [x] 补 Git/Diff summary/files/unified 三模式、当前文件分页游标缓存和切换视图复用；GitHub 工作台已在本轮独立收口，现场门仍单独记录。
- [x] 补 workspace 文件浏览、相对路径校验、受限下载和敏感错误降级。
- [x] 将 settings/doctor 解析为八组强类型状态，接入 `daemon.status`、`daemon.health`、`workspace.registry.doctor`、脱敏 JSON/text 导出和受控 remediation actionId。
- [x] 补旧 Bridge 缺 capability/字段时的安全降级和不可达状态（RPC optional request、缺字段安全默认值、daemon/doctor fallback）；旧 Bridge 现场仍需独立验证。
- [x] 为上述已完成能力增加 contract/live smoke，并把真实执行命令和结果写入本文件及 R6 进度文件。
- [x] 接入 GitHub OAuth/account/binding、PR 分页/状态/更新、reviewer/label/merge、checks/watch 和附件 preview/upload；高风险操作统一使用 Bridge planId preview/confirm，未配置资产上传器时安全降级。

## R6-WEB-3 已启动的源码工作

- [x] Web 标签通过 `BroadcastChannel` 只同步 `refresh`、`workspace.changed`、`session.changed` 和 `logout` 事件；消息不携带 token、cookie、凭证或原始内容。
- [x] R65 为 BroadcastChannel 消息增加 endpoint、hostProfileId 与 payload scope；跨 endpoint/host 事件被丢弃，workspace.changed 改为 registry + 受影响 session 的局部刷新，scope/session changed 只刷新当前 selection。
- [x] Web 连接生命周期增加连接代际、显式 shutdown、pagehide 清理、刷新请求合并和迟到刷新丢弃；登出后重新提交登录可恢复传输与刷新 timer。
- [ ] 在真实浏览器中验证两标签 workspace/chat 重连、注销传播和重复订阅清理。
- [ ] 验证旧 Bridge 缺字段/capability、长 terminal binary 流、断线恢复和完整 Git/Diff 工作台。
- [x] Web GitHub 工作台源码与 RPC live smoke 已完成；真实 GitHub 账号/组织权限/资产服务仍归入 FIELD，不以 mock smoke 替代现场。

## R11-WEB-WORKSPACE-REGISTRY 已完成的源码工作

- [x] Web workspace 区增加 Import 入口和状态反馈；workspace 条目提供 Select、Open、Archive 操作。
- [x] Import/Open/Archive 均执行 preview -> confirm；请求期间通过 `workspaceActionInFlight` 禁止重复提交；旧 Bridge 缺 import RPC 时回退到 `workspace.registry.create`。
- [x] Archive 只标记 registry，不删除本地目录；归档当前 workspace 后 active 选择逻辑不会重新选回已归档 workspace。
- [x] Web contract/live smoke 覆盖临时目录 import preview/confirm、open preview、archive preview/confirm 和 active/includeArchived 列表语义。

## R12-USAGE-METADATA-SCOPE 已完成的源码子阶段

- [x] 新增 `metadata-scope.js`，按当前 AgentManager 记录和连接握手校验 session、agent、provider、providerSession、workspace 与 hostProfileId；旧 session/旧客户端缺字段时保留兼容 warning。
- [x] `metadata.generate` 改为白名单 Provider payload，workspacePath 取受管 Agent/Provider scope，prompt/timeline/diff 摘要限制 UTF-8 大小并脱敏 token、password、secret、authorization 和 private key。
- [x] Provider usage service 支持 Provider `usageEndpoint`、`usageEndpointEnv`、`usageEndpointTokenEnv`，并保留 Codex 环境变量兼容；endpoint/重定向只允许 HTTPS，响应体、超时和重定向次数受限。
- [x] 新增 metadata scope 与 usage endpoint smoke，覆盖跨 Agent/workspace/Provider/session/host、旧 session 降级、敏感字段不下传、HTTPS redirect、HTTP downgrade、embedded credential、环境 token 和结构化失败。
- [x] `check:r12` 已加入 `tools/agent-bridge/package.json`；protocol alignment、既有 provider usage smoke 与 R12 定向 smoke 本轮退出码均为 0。
- [x] 通过 `postcheck` 将 R12 smoke 合并进 Bridge 正式 `npm run check` 命令；本轮全量 check 退出码为 0。
- [ ] 用真实 Provider 验证 quota、长会话 usage/compaction、四类 metadata、timeout/cancel 和真实 App 数据；这些仍是 FIELD 现场门。

## R13-WEB-LEGACY-COMPAT 已完成的源码阶段

- [x] 新增 `src/web/compatibility.js`，统一归一化 Bridge feature advertisement、serverInfo compatibility、Agent attach/session messages、workspace registry、optional RPC failure 和事件 scope。
- [x] `app.js` 在 refresh 阶段只生成一次 capabilities；增强入口统一通过 `featureEnabled()` gate，旧 Bridge 缺少 feature 广告时只保留核心 Agent/chat/workspace 能力。
- [x] Session messages 缺失或不支持时继续使用 attach payload 的 messages/timeline；workspace registry 不可用时继续从 Agent scope 构造只读 fallback；workspace import 的 create fallback 保留。
- [x] 未知事件被忽略，带 host/workspace/agent/session scope 的迟到事件在更新 UI 前校验当前 scope；缺 scope 的旧事件保持兼容。
- [x] 新增 Web compatibility smoke；Web contract smoke 增加归一化与 gate 断言；Web live smoke 验证 compatibility.js 同源静态资源和安全响应头。
- [ ] 真实旧 Bridge、双标签、长 terminal/diff 流、真实浏览器和 HarmonyOS App 全量动作仍属于 R6-WEB-3/R7/FIELD，不能由本轮 mock/live smoke 代替。

## R14-VOICE-CONTRACT 已完成的源码子阶段

- [x] `VoiceManager` 对显式配置和环境配置统一要求 HTTPS；非 HTTPS、用户名/密码或 fragment 端点被拒绝。
- [x] `voice.status.warnings` 只返回稳定 warning code，不返回端点 URL、token 或其他敏感配置。
- [x] Bridge 默认不宣告本机 audio capture/playback、VAD 或 interruption handling；远程 STT/TTS 仅按有效 HTTPS endpoint 发布。
- [x] App Voice result/parser 增加强类型 warnings，并保持独立 capability 的 false 安全默认值。
- [x] 定向 Voice smoke、Bridge 全量 check 与 SDK 23 `assembleHap --no-daemon --stacktrace` 通过；HAP 仅尝试安装到 `5KLBB25A10203862`，因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试。

## R14 后续现场门

- [ ] 真机权限撤销、前后台、音频焦点、来电、耳机/蓝牙和设备路由。
- [ ] 真实 STT/TTS Provider 的 partial/final、MIME/采样率/声道、超时、弱网和播放失败。
- [ ] 长录音、内存清理和不同设备型号兼容。

## R23-VOICE-CAPTURE-LIFECYCLE 已完成的源码子阶段

- [x] `VoicePlatformFacade` 为每次 `AudioCapturer` 绑定 generation 和 capturer identity，迟到 `readData` 不进入新会话的 PCM 队列。
- [x] 采集释放使用同一 callback 调用 `off('readData', ...)`，并清空 active callback 引用。
- [x] `AudioSessionManager` 的 `audioSessionDeactivated` listener 在 facade `release()` 时成对注销，避免页面销毁后中断回调继续写状态。
- [x] App 录音入口与播放入口使用独立 capability gate，仅 TTS 可用时不把录音动作显示为可用。
- [x] 本轮实际执行 Voice platform smoke、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace`；均退出码 0。
- [ ] `5KLBB25A10203862` 本轮检查为 Offline，因此没有安装；没有触碰其他设备，也没有启动或测试。

## R23 后续现场门

- [ ] 真机权限、音频焦点、来电、蓝牙/耳机、前后台和设备路由。
- [ ] 真实 STT/TTS Provider、弱网、长录音和进程终止后的资源清理。

## R15-USAGE-METADATA-CONTRACT 已完成的源码子阶段

- [x] Provider 明确返回 unavailable/error/failed 时，usage DTO 的 `ok` 与 status 保持一致；缺失数值继续保持 unavailable。
- [x] 带环境 Bearer token 的 usage endpoint 只允许同 origin HTTPS 重定向，避免将认证头转发到另一主机；HTTP 降级、嵌入凭证和大小/超时限制继续生效。
- [x] Codex metadata 结果保留结构化 alternatives；Bridge 同时兼容结构化 Provider 和旧字符串 Provider，并返回可选 warnings/estimatedUsage。
- [x] 新增并通过 usage、endpoint 和 Codex metadata 定向 smoke；本轮不以 smoke 替代真实 Provider 现场。

## R15 后续现场门

- [ ] 真实 Provider quota、长会话 usage/compaction、四类 metadata、timeout/cancel 和真实 App 数据。

## R16-BROWSER-RESULT-INTEGRITY 已完成的源码子阶段

- [x] `BrowserAutomationManager.handleHostResult()` 对 host 返回结果使用显式安全复制，不允许结果覆盖 Bridge 权威的 `ok`、`commandId`、`hostId`、`updatedAt` 或结构化失败字段。
- [x] 过滤 `__proto__`、`constructor` 和 `prototype` 顶层键，避免不可信 Browser host 结果改变响应原型或伪造响应归属。
- [x] manager smoke 覆盖伪造字段、原型污染键、一次性 pending 消费和重复结果拒绝；`npm run check:browser` 与全量 `npm run check` 本轮均退出码 0。
- [x] Browser upload preview/confirm 绑定 realpath、文件大小、mtime 和 SHA-256；默认限制单文件 64 MiB、总计 128 MiB，文件变化或超限时拒绝执行。

## R16 后续现场/源码门

- [ ] 真实受支持 Browser host、真实上传/下载、登录态、恶意页面和 host 清理现场。
- [ ] HarmonyOS App navigate/action/logs/download/close 全量控制入口与 capability 降级。
- [ ] 多标签、旧 Bridge、长流和平台 host 现场验证。

## R94-BROWSER-PUBLIC-RESULT-REDACTION 已完成的源码子阶段

- [x] 所有外部 host result 通过统一递归 DTO 过滤，限制嵌套深度、对象键数、数组条目和文本 UTF-8 大小。
- [x] 嵌套 credential/header/cookie、私有路径和带敏感查询参数的 URL 不再进入公开响应；普通 page/snapshot/screenshot/action 字段保持兼容。
- [x] manager smoke 覆盖 page list 的嵌套敏感字段与 URL，`npm run check:browser` 和 Bridge 全量 `npm run check` 本轮通过。

## R94 后续现场门

- [ ] 受支持平台 Browser host、HarmonyOS App 全量动作、真实上传/下载、登录态、恶意页面和真机现场。
- [ ] 多标签、旧 Bridge、长流和平台 host 现场验证。

## R17-REMOTE-CONFIG-URL-INTEGRITY 已完成的源码子阶段

- [x] `DaemonRemoteConfigManager` 使用统一 URL parser，拒绝非 HTTPS、嵌入凭证、fragment、控制字符和无效 host。
- [x] 默认下载器每次重定向都重新执行同一校验，避免 HTTPS 入口通过 HTTP、凭证或 fragment 重定向降级。
- [x] remote-config smoke 覆盖合法/非法 URL；本轮 `npm run check` 退出码 0。

## R17 后续现场/源码门

- [ ] 跨平台 daemon 安装、自启重启、rolling 操作和真实签名配置现场。
- [ ] App Fleet 多 host、旧 Bridge 和配置损坏/原子写入失败现场。

## R7-HOST 已完成的源码工作

- [x] Web Browser 工作台已覆盖 host 选择、instance list/create/close、page create/list/close、navigate/back/forward/reload、snapshot、screenshot、logs、wait、download list、permission 和 click/fill/type/keypress/hover/select/drag/upload/scroll/download/evaluate。
- [x] 页面动作和关闭操作统一复用 Bridge preview/confirm；host 显式 capability 不包含目标命令或 action 时，Web 不显示对应按钮并保留 Bridge failureCategory。
- [x] 上传只收集 workspace-relative 路径，前端拒绝绝对路径和 `..`；Bridge 继续执行 realpath、workspace ownership、MIME/大小和下载目录校验。
- [x] 新增 Web 合同断言，覆盖 browser RPC、全部 action、实例/下载控件和 capability/path 安全 helper；`node --check`、Web contract/live、Browser manager/CDP/live/protocol 与 Bridge 全量 check 均通过。

## R8-APP-BROWSER 已完成的源码工作

- [x] `AgentBridgeBrowserResult` 解析 envelope `id` 与 payload `requestId`，并在缺字段时使用空字符串安全默认值。
- [x] HarmonyOS App 使用强类型 Browser pending request 表按 request ID 关联乱序响应；只有单个在途请求时才兼容无 ID 的旧响应，多请求无 ID 不更新当前 UI。
- [x] 空 request ID 不会清除其他在途请求；关闭实例/页面的确认预览捕获预览时的目标 scope，避免并发刷新覆盖确认对象。
- [x] 主机切换、Bridge 断开、页面销毁和 session window 释放会清理 pending 请求与截图预览，避免旧 host/epoch 迟到结果污染当前页面。
- [x] 截图预览限制 MIME（PNG/JPEG/WebP）和 8 MiB Base64 载荷；失败、超限或不支持格式会清除预览并保留结构化错误。
- [x] `AgentBridgeBrowserParser.test.ets` 增加 request ID、截图字段和安全默认值断言；本轮 `npm run check:browser`、`npm run check` 与 SDK 23 HAP 构建通过。

## R24-VOICE-FIELD-VALIDATION 已完成的源码子阶段

- [x] `VoiceManager` 对录音 MIME、采样率、声道数、采样深度和语言执行显式验证；非法值返回稳定 failure category，不再静默夹断。
- [x] STT transcript、partial transcript、voiceId 和 TTS 文本执行控制字符清理与长度限制；缺失的 confidence/durationMs 不写入伪造数值。
- [x] TTS 请求和 Provider 返回音频格式使用同一 allowlist，支持既有 MIME 与短格式别名；未知返回格式和无效 sample profile 结构化失败。
- [x] Provider 异常通过稳定类别映射为脱敏文案，定向 smoke 覆盖异常信息不泄漏。
- [x] 本阶段证据文件为 `docs/agent-bridge-r24-voice-field-validation-progress.md`；Voice manager/platform 定向 smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP 构建均已通过。指定设备 `5KLBB25A10203862` Offline，未安装、启动或设备测试。

## R24 后续现场门

- [ ] 真机权限、音频焦点、来电、蓝牙/耳机、前后台和设备路由。
- [ ] 真实 STT/TTS Provider、弱网、长录音、格式协商、超时/取消和进程终止清理。

## R25-USAGE-METADATA-RESULT-INTEGRITY 已完成的源码子阶段

- [x] Provider usage 的 quota numeric fields 只接受非负有限安全整数；负值、Infinity 和超限值保持 unavailable，不再夹成 `0`。
- [x] quota event 继承同一数值校验；非法窗口不会进入 Usage store，仍保持 eventId 幂等和 host/session/provider scope。
- [x] metadata scope 对显式未知 kind 返回 `metadata_kind_invalid`，缺失 kind 继续兼容 `sessionTitle`。
- [x] Bridge 通过 `normalizeMetadataResult()` 统一清理 Provider suggestion/alternatives/warnings，限制 UTF-8 字节、去重和 warning 数量，并用 `metadata_result_truncated` 标记截断。
- [x] 通用 metadata Provider 异常不再回显原始错误文本；定向 smoke 已覆盖负配额、未知 kind、输出截断和脱敏失败。
- [x] 证据文件为 `docs/agent-bridge-r25-usage-metadata-result-integrity-progress.md`；Provider usage/metadata 定向 smoke 与 Bridge 全量 `npm run check` 均已实际退出码 0。

## R25 后续现场门

- [ ] 真实 Provider quota endpoint、套餐字段、长会话 usage/compaction 和四类 metadata 数据。
- [ ] 真机 Usage/Diagnostics 展示、网络异常和跨 host 现场。

## R26-METADATA-REQUEST-INTEGRITY 已完成的源码子阶段

- [x] `metadata.generate` 在 Provider turn 前建立 request state，timeout 不再提前等待 Provider；超时、取消和连接断开都会阻止迟到结果回写。
- [x] `metadata.generate.cancel` 校验连接、host、session 和 agent scope；重复 cancel、重复 request 和控制请求响应路由均有稳定行为。
- [x] App parser/页面状态保留 requestId、timeoutMs、cancelled，MCP/CLI 暴露 cancel 与 timeout；mock Provider 可控延迟用于行为 smoke。
- [x] 证据文件为 `docs/agent-bridge-r26-metadata-request-integrity-progress.md`；R26 smoke、Bridge 全量 `check` 和 SDK 23 HAP 构建均已实际退出码 0。

## R26 后续现场门

- [ ] 真实 Provider 四种 metadata kind 的长会话 timeout/cancel、断线和凭证/权限错误。
- [ ] 真机 Usage/Diagnostics/metadata UI、host 切换和 session window 生命周期。

## R27-METADATA-WS-DISCONNECT 已完成的源码子阶段

- [x] 将 R26 行为 smoke 的证据范围修正为 timeout/cancel/duplicate/scope；不再把 HTTP smoke 写成真实 WebSocket disconnect 验证。
- [x] 新增 `scripts/check-metadata-request-disconnect-smoke.js`，通过真实 WebSocket 发起延迟 metadata 请求、主动 terminate，并用 `daemon.status` 验证活动 WebSocket 已注销。
- [x] 等待迟到 Provider turn 越过旧连接生命周期后，在新连接复用同一 requestId；响应只能由新连接产生，验证旧 pending 不跨连接回写。
- [x] 新增 `check:r27` 并接入 `postcheck`，保证后续 Bridge 全量 `npm run check` 自动执行该断开 smoke。
- [x] 实际执行 R26/R27 定向 smoke 与 Bridge 全量 `npm run check`；均退出码 0，`postcheck` 再次执行 R27 disconnect smoke。

## R27 后续现场门

- [ ] 真实 Provider 四种 metadata kind 的长会话 timeout/cancel、断线、凭证撤销和权限错误。
- [ ] 真机 Usage/Diagnostics/metadata UI、host 切换和跨窗口生命周期。

## R28-USAGE-METADATA-LIVE 已完成的源码子阶段

- [x] Mock Provider 通过显式环境开关产生 actual/estimated/quota/compaction 测试事件；默认行为不变。
- [x] `sendObservedEvent` 对缺少 agentId 的 Provider usage 事件补齐当前 session Agent，修复 session+agent budget warning/summary 的真实处理缺口。
- [x] 新增 `check-usage-metadata-live-smoke.js`，覆盖 WebSocket host scope、异步 message queue、budget warning、usage summary/events、四类 metadata、host 隔离和重连恢复。
- [x] R28 定向 smoke 已实际退出码 0；`check:r28` 已注册到 `postcheck`。
- [x] Bridge 全量 `npm --prefix tools/agent-bridge run check` 已实际退出码 0；`postcheck` 再次执行 R28 live smoke。

## R28 后续现场门

- [ ] 真实 Codex/OpenCode/Gateway Provider 的 quota endpoint、套餐字段、长会话 compaction 和四类 metadata。
- [ ] 真机 Usage/Diagnostics/metadata 展示、网络异常、host 切换和 session window 生命周期。

## R29-USAGE-EVENT-NORMALIZATION 已完成的源码子阶段

- [x] `UsageManager.record()` 对 token、quota、compaction 数值只接受非负安全整数，对 cost 只接受非负有限数；非法字段保持 unavailable，不进入持久化事件或预算计算。
- [x] 只有 inputTokens 与 outputTokens 同时存在时才推导 totalTokens；显式 totalTokens 和既有双侧 token 事件保持兼容，单侧 token 不再伪造总量。
- [x] 聚合和 compaction projection 对已有持久化事件再次执行同一数值校验，避免历史损坏值污染 summary。
- [x] 新增 `scripts/check-usage-event-normalization-smoke.js` 并接入 `check:r29`/`postcheck`；覆盖非法值、单侧 token、有效 cost、预算告警、重复事件、重启恢复和 host 隔离。
- [x] 本轮实际执行 R29 定向 smoke、usage recovery smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均退出码 0；没有 ArkTS 修改、HAP 构建或设备安装。

## R29 后续现场门

- [ ] 真实 Codex/OpenCode/Gateway Provider quota endpoint、套餐凭证、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 展示。

## R30-PROVIDER-USAGE-FRESHNESS 已完成的源码子阶段

- [x] Bridge `normalizeProviderUsage()` 增加可选 `stale` 语义：有效过期时间或 Provider 显式 stale 标记都会被公开为 stale，同时保留只读快照状态。
- [x] stale quota snapshot 不再生成新的 `kind=quota` Usage event；缺少 stale 字段的旧结果继续按 legacy 行为兼容。
- [x] App Provider Usage 模型、parser 和状态文案支持 stale，旧 Bridge 缺少字段时默认 false。
- [x] 新增 `check-provider-usage-freshness-smoke.js` 并接入 `check:r30`/`postcheck`；App parser 增加 stale 断言。
- [x] 本轮实际执行 freshness smoke、既有 Provider Usage smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`、`git diff --check` 和 SDK 23 HAP 构建，均退出码 0；HAP SHA-256 为 `C44FACAC5A87F58E75B1B52021A84A31BDAB01E0F9A51D16E23A3F2A2243F24F`。`5KLBB25A10203862` 为 Offline，未安装、启动或测试。

## R30 后续现场门

- [ ] 真实 Codex/OpenCode/Gateway Provider quota endpoint、套餐凭证、长会话 compaction、四类 metadata 和真机 Usage/Diagnostics 展示。

## R31-FLEET-EXECUTOR-FAILURE 已完成的源码子阶段

- [x] Fleet rolling coordinator 捕获单实例 executor 异常，归一化为稳定失败结果。
- [x] 首错停止并保留后续 pending，已完成实例和 excluded/isolate 结果不丢失。
- [x] 新增纯逻辑测试覆盖异常不外抛、调用次数、failed message 和 pending 目标。
- [x] Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 SDK 23 HAP 构建退出码均为 0；HAP SHA-256 为 `E264D2EED61351B6292F60471DC557271E73C4B7134B5E61082A91EFF810D8C9`。`5KLBB25A10203862` 为 Offline，未安装、启动或测试。

## R31 后续现场门

- [ ] 两个临时 Bridge 的真实 rolling restart/update/rollback、跨平台自启/升级/回滚和权限路径。

## R32-REMOTE-CONFIG-STATE-INTEGRITY 已完成的源码子阶段

- [x] remote config schema v1 校验版本、scope、priority、values 深度/数量/字符串限制、有限数值、签名编码，并对未知顶层字段返回兼容 warning。
- [x] Bridge 启动 reconcile active、previous、fetched 条目；损坏 active/previous 保留 validation 并标记 degraded，损坏 fetched 清除，不联网或自动修复。
- [x] validate/preview/apply 重新计算 fetched digest；rollback 在 preview/confirm 前重新校验 previous，摘要漂移、签名错误和状态来源 URL 异常均被阻断。
- [x] fetch/apply/rollback 原子写失败统一返回 `state_persist_failed`，plan 不消费；status 公开可选 digest、fetchedVersion、previousValidation 和稳定 failure category，不返回远程文档正文。
- [x] `check:r32` 已加入 `tools/agent-bridge/package.json` 的 `postcheck`。
- [x] 本轮已执行 `node --check`、R32 remote-config smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均退出码 0；本阶段没有 ArkTS 修改、HAP 构建或设备安装。

## R32 后续现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启、真实签名配置和双 Bridge rolling；失败只重新打开对应现场子步骤。

## R33-VOICE-SESSION-STATE 已完成的源码子阶段

- [x] `VoicePlatformFacade` 后台拒绝新的录音请求，麦克风权限统一走 check -> request -> re-check 门，并公开 `microphonePermission` 与受控 `permissionRemediation`。
- [x] `NGFVoiceAudioSessionState` 将音频会话公开为 `inactive`、`active`、`interrupted`；主动 deactivate 与系统 deactivation 事件通过期望事件计数区分。
- [x] 系统中断处理增加活动音频检查和 in-flight guard；重复 cancel/release/stop 不再把 idle 状态误报成 interruption。
- [x] 新契约从 `ngf_framework` media index 导出，Voice parser 测试覆盖默认生命周期状态与权限 remediation；contract smoke 已加入 Bridge `postcheck` 路径。
- [x] 本轮实际执行 Voice contract smoke、`npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`；HAP SHA-256 为 `FC5C1C4EAA590468287463AE444863516CEEA35831322A15113599CD186E7837`。
- [x] 构建后只向 `5KLBB25A10203862` 执行安装尝试；HDC `9568423`（签名 profile 未授权 UDID），未启动或测试，没有向其他设备安装。

## R33 后续现场门

- [ ] 真机首次授权、系统撤销/永久拒绝、隐私指示和权限恢复。
- [ ] 耳机/蓝牙切换、来电/其他应用抢占、锁屏、前后台和真实 AudioInterrupt 路由。
- [ ] 真实 STT/TTS Provider 弱网、超时、长录音、撤销和音频格式兼容。

## R34-COMPATIBILITY-PROTOCOL-SUMMARY 已完成的源码子阶段

- [x] `AgentBridgeCompatibilityInfo` 增加可选 `minimumProtocolVersion`、`recommendedProtocolVersion` 和 `supportedProtocolVersions`；`AgentBridgeServerInfo` 保留顶层支持协议列表，旧 Bridge 缺字段时安全为空。
- [x] App `parseServerInfo` 在 compatibility 内缺少支持列表时从顶层 `supportedProtocolVersions` 补齐；兼容卡将协议最低/建议/支持摘要与 App/Bridge 版本一起展示。
- [x] `buildCompatibilityInfo()` 统一生成协议摘要字段，Bridge serverInfo 明确传入 `minimumProtocolVersion`；现有 status/blocking 判定和旧客户端兼容保持不变。
- [x] `AgentBridgeM5Parser.test.ets` 覆盖 compatibility/serverInfo 协议摘要；`check-diagnostics-smoke.js` 覆盖 Bridge builder 的字段输出。
- [x] 本轮已执行 diagnostics Node 定向 smoke、Bridge 全量 `check`（`system-conpty`）、SDK 23 HAP 构建和 `git diff --check`；HAP SHA-256 为 `730A331A6A8BEAEEDF20D4CA3EC0B809474D2ABA6FFC4FE16BC4AF97CF5F5089`。设备操作严格限定为 `5KLBB25A10203862`，仅安装一次并因 HDC `9568423`（签名 profile 未授权 UDID）失败；未启动、不截图、不读日志、不测试，未操作其他设备。

## R34 后续现场门

- [ ] 连接真实旧 Bridge/新 Bridge，验证缺字段、协议不兼容、建议升级和 blocking 状态矩阵。
- [ ] 在指定真机上确认兼容卡与诊断导出展示；设备安装失败时只记录签名/授权原因，不改用其他设备。

## R35-COMPATIBILITY-MATRIX 已完成的源码子阶段

- [x] `buildCompatibilityInfo()` 在支持列表缺失时按同一协议族数字后缀校验 `minimumProtocolVersion`；低于最低协议返回 blocking，缺少客户端协议或协议族不一致返回 `unknown`。
- [x] 推荐协议只在可比较且客户端低于推荐版本时给出 `upgradeRecommended`，避免不同协议族被误报为升级建议。
- [x] `check-compatibility-matrix-smoke.js` 已覆盖 minimum-only、低版本、缺字段、族不一致和显式支持列表，并注册为 `check:r35`/`postcheck`。
- [x] 本轮 targeted compatibility/diagnostics/Agent Experience smoke 和 Bridge 全量 check（含 `check:r35`）均通过。本轮没有 ArkTS 变化、HAP 构建或设备安装。

## R36-BROWSER-APP-CAPABILITY 已完成的源码子阶段

- [x] App server feature parser 增加 `browserHostCapabilityMetadata`/`browserPlatformHost`，缺字段时继续旧兼容默认。
- [x] Browser host model/parser 增加 host kind、runtime、capability source、readiness、supported platforms 和 capability warnings。
- [x] Browser App host 卡展示 metadata/readiness；新 capability 下只允许 ready host dispatch，旧 Bridge 继续按 legacy connected/capability 运行。
- [x] Browser App 失败 category 统一映射受控 i18n 文案和重试提示，避免把原始错误/路径写入 UI；上传控件明确 workspace-relative 范围。
- [x] Parser 定向测试已补 metadata、readiness、warnings、feature flag 和下载记录断言。
- [x] 本轮 ArkTS parser/model 进入 SDK 23 编译并通过；Bridge 全量 check、SDK 23 HAP 构建、指定设备安装尝试和 `git diff --check` 均已执行并记录在 R36 监督文件；安装因 HDC `9568423`（签名 profile 未授权 UDID）失败，未启动或测试。

## R36-BROWSER-APP-CAPABILITY 验证收口

- [x] 本轮 `npm --prefix tools/agent-bridge run check` 使用 `system-conpty` 完成，Browser/Web/协议/CLI/MCP/daemon/Provider/Voice postcheck 全部通过。
- [x] 本轮 SDK 23 `assembleHap --no-daemon --stacktrace` 成功，HAP SHA-256 为 `F15C24A2F0A8BC393F5292984EDB0C317960874D209EE945ECA5BBF795E39461`。
- [x] 安装动作只指向 `5KLBB25A10203862`，返回签名 profile 未授权 UDID；没有启动应用、读取设备日志、截图或测试其他设备。
- [x] R36 源码子阶段关闭；真实平台 host、浏览器服务和 HarmonyOS 真机 Browser 全量动作不被自动化结果冒充，继续由 FIELD 轨道管理。

## R36 后续现场门

- [ ] 真实平台 Browser host adapter 和 HarmonyOS App 全量动作。
- [ ] 真实上传/下载、恶意页面、登录态、跨标签、长流和设备现场。

## R37-VOICE-PLAYBACK-GENERATION 已完成的源码子阶段

- [x] 远程 TTS 创建 `AVPlayer` 时捕获 `remotePlaybackGeneration` 和 player identity；迟到的旧播放器 `completed/error` 状态不会进入当前播放状态机。
- [x] 远程播放器 callback 保存到 facade 字段，释放时用同一 callback 调用 `off('stateChange', callback)`，并在 stop/release 时推进 generation 使旧回调失效。
- [x] Voice platform contract smoke 增加 generation、player identity、callback 保存/注销和 stop invalidation 断言，并继续由 `postcheck` 执行。
- [x] 本轮实际执行 Voice contract smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP SHA-256 `F378C3863E3CA8DF22CF9DF1073E54F1DAFFB3EEB8B62AD0CC39CD20EDA4143D`。
- [x] 本轮没有安装、启动或测试设备；没有操作除 `5KLBB25A10203862` 之外的设备。

## R37 后续现场门

- [ ] 真机首次授权、系统撤销/永久拒绝、隐私指示和权限恢复。
- [ ] 耳机/蓝牙切换、来电/其他应用抢占、锁屏、前后台和真实 AudioInterrupt 路由。
- [ ] 真实 STT/TTS Provider 弱网、超时、长录音、撤销和音频格式兼容。

## R38-VOICE-TTS-CANCELLATION 已完成的源码子阶段

- [x] Bridge `VoiceManager` 为 TTS request 保存 cancelled 状态和 request identity；stop、owner detach、shutdown 在 abort 前标记取消。
- [x] Provider response 解析后、`tts.ready` 发布前重新校验 request identity、cancelled 和 AbortSignal；Provider 忽略 abort 的迟到结果统一为 `voice_cancelled`，不再发布 ready。
- [x] `check-voice-manager-smoke.js` 增加延迟 Provider 取消竞态，验证 stop 后迟到音频不会进入 ready 事件。
- [x] 本轮实际执行 Voice manager 定向 smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均退出码 0；本轮未修改 ArkTS，未构建或安装 HAP。

## R38 后续现场门

- [ ] 真实 Provider 忽略取消、超时、断线和重试语义。
- [ ] 真机播放停止/打断、音频路由、蓝牙/来电和前后台切换。

## R39-VOICE-TTS-CLIENT-CORRELATION 已完成的源码子阶段

- [x] `AgentBridgeVoicePayload`/`AgentBridgeVoiceResult` 增加可选 `clientRequestId`；App parser 采用安全默认值，旧 Bridge 缺字段不崩溃。
- [x] `VoiceManager` 校验 client id、在 TTS lifecycle 结果中回显，并让带 client id 的 stop 优先按 owner-scoped client id 查找；内部 request id 路径保持兼容。
- [x] `NGFAgentHomePage` 为每次远程 TTS 生成本地关联 id，等待响应阶段即可中断；取消快照、当前 RPC/internal id 和 client id 共同作为迟到结果过滤条件。
- [x] 本轮实际执行 Voice manager/protocol 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP SHA-256 `5EA2E28465CA69451AD6B1CA30DB7EFFB2CD2E862EAA272F6C90EFDEBC4D9C40`。
- [x] HAP 只向 `5KLBB25A10203862` 执行安装尝试，HDC `9568423`（签名 profile 未授权设备 UDID）；未启动、未读取日志、未截图、未测试，也未操作其他设备。

## R39 后续现场门

- [ ] 真实 Provider 的 client id/取消/超时/断线语义和弱网重连。
- [ ] 真机播放停止/打断、音频路由、蓝牙/来电、前后台和权限状态。

## R40-MESSAGE-QUEUE-ATTEMPT 已完成的源码子阶段

- [x] Message queue state schema 从 v1 幂等迁移到 v2；旧条目缺少 attempt 字段时保持原 queue/client id，并在首次读取或写入时补齐安全默认值。
- [x] 首次 drain 为条目创建 `attemptId` 和 attempt history；sending/accepted/failed/cancelled 会更新同一 attempt 的状态和时间。
- [x] failed retry 保留原 `queueId` 与 `clientMessageId`，创建新的 queued attempt 并通过 `retryOfAttemptId` 建立关联；重连、重复 enqueue 和 daemon 重启不会重复创建业务消息。
- [x] Public queue result 只公开受限 attempt history，不公开 payload 中的 token/credential 或 child chat-history；App parser 读取可选 `attemptId`/attemptHistory，旧响应安全降级为空。
- [x] 本轮实际执行 `node --check src/agent-experience-manager.js`、`node scripts/check-agent-experience-smoke.js`、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`；均无新增阻断错误，ArkTS 只保留既有警告；HAP SHA-256 `C36BA685E954A06001B68458AF6481AAD38A9DAAB7B91798B7CECE6D70B1DCF1`。
- [x] 本轮未安装、启动或测试设备；没有操作除 `5KLBB25A10203862` 之外的设备。

## R40 后续现场门

- [ ] 真实 Provider 忙碌、并发、取消和弱网断线期间的 attempt 状态观察。
- [ ] 指定真机上的队列卡、重连合并和长会话性能；若安装 HAP，只允许目标 `5KLBB25A10203862`，且仅执行安装。

## R41-DAEMON-STATUS-GENERATION 已完成的源码子阶段

- [x] daemon status 快照绑定 `hostProfileId + connectionEpoch + requestId`；旧请求、重复响应和旧 host/epoch 不更新当前状态。
- [x] 已建立 `instanceId` 后拒绝身份缺失或身份变化的迟到快照；generation/workerGeneration 只允许单调推进，旧代际不能覆盖新快照。
- [x] 旧 Bridge 缺少 instance/generation 字段时保持兼容降级；host 激活、切换和清理重置 coordinator。
- [x] 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、`hvigor tasks --no-daemon` 和 `git diff --check`，均无新增阻断错误。
- [x] 证据文件：[agent-bridge-r41-daemon-status-generation-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r41-daemon-status-generation-progress.md)。

## R41 后续现场门

- [ ] 跨平台 daemon 的真实 instance/generation/heartbeat 连续变化和 supervisor 替换。
- [ ] 双 Bridge A → B → A、旧 generation 响应和 rolling 操作现场。

## R42-BROWSER-REQUEST-SCOPE 已完成的源码子阶段

- [x] Browser pending request 记录 workspace/host/instance/page scope 和 action；request id 优先，旧 Bridge 缺 request id 时仅在单请求场景兼容。
- [x] 响应顶层 scope、instance/page DTO 和列表条目执行一致性校验；scope 冲突一次性消费并丢弃，不残留 pending。
- [x] `NGFAgentHomePage` 的 Browser 请求开始、完成和清理路径统一接入 coordinator，原有 Preview/Confirm 快照链保持不变。
- [x] 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check:browser` 和 `git diff --check`，均无新增阻断错误。
- [x] 证据文件：[agent-bridge-r42-browser-request-scope-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r42-browser-request-scope-progress.md)。

## R42 后续现场门

- [ ] 真实 HarmonyOS/WebView 或其他受支持平台 host 的能力注册与全量动作。
- [ ] 真实页面导航、登录态、恶意页面、上传/下载和断线清理。

## R43-VOICE-REQUEST-SCOPE 已完成的源码子阶段

- [x] 新增 `AgentHomeVoiceRequestCoordinator`，将远程 STT start/finish/cancel 与 hostProfileId、connectionEpoch、请求 id、Bridge session id 和取消状态绑定。
- [x] Agent Home 取消操作会使尚未返回 session 的 start 请求失效；迟到 start 不会重新启动本地录音。
- [x] transcript、VAD、chunk 和 session update 只接受当前远程 session；finish/cancel 响应拒绝其他 request id，完成/失败/页面退出/host 清理会释放 coordinator。
- [x] `AgentHomeVoiceRequestCoordinator.test.ets` 已注册到 `List.test.ets`；protocol alignment smoke 已增加 coordinator 接线断言。
- [x] 定向 Node 语法检查、protocol alignment smoke 和 `git diff --check` 已通过；本阶段 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 退出码 0，SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0（`BUILD SUCCESSFUL in 36 s 230 ms`）。
- [x] HAP `entry/build/default/outputs/default/entry-default-signed.hap` 为 14,297,965 bytes，SHA-256 `B341D347DC7C00507D02B9E371A45B4A755C9825DBF634AFA4AFABDA147A4F5B`；本阶段未安装、启动或测试设备。
- [x] 证据文件：[agent-bridge-r43-voice-request-scope-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r43-voice-request-scope-progress.md)。

## R43 后续现场门

- [ ] 真实 Provider 的 STT start/finish/cancel 迟到、断线、弱网和重试行为。
- [ ] 真机权限撤销、耳机/蓝牙、来电/其他应用抢占、前后台和真实音频路由。

## R44-VOICE-EVENT-SCOPE 已完成的源码子阶段

- [x] Voice Manager 的 STT/TTS/session/VAD lifecycle event 绑定 owner id；公开 session/result DTO 不包含 owner id。
- [x] `voice-event-router.js` 按 connectionId 精确单播，空 owner 或不匹配连接不会收到事件；server 发送前剥离内部 owner metadata。
- [x] `check-voice-event-scope-smoke.js` 已加入 `package.json` 的全量 `check`，覆盖双连接隔离、空 owner 阻断和 server 静态接线。
- [x] 本轮实际执行 Voice event smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check`，均退出码 0。

## R44 后续现场门

- [ ] 真实 Provider 的 STT/TTS 迟到、断线、弱网、重试和取消行为。
- [ ] 真机权限、音频焦点、耳机/蓝牙、来电抢占、前后台和实际音频路由。

## R45-BROWSER-EVENT-SCOPE 已完成的源码子阶段

- [x] Browser host 注册/注销和 workspace domain permission 更新事件现在绑定内部 owner connectionId；不再通过全局 `broadcastToClients` 投递。
- [x] 新增 `browser-event-router.js` 精确单播；空 owner、未知 owner 和不匹配连接均阻断，server 发送前移除内部 owner 字段。
- [x] `browserAutomationManager.execute()` 将当前 connectionId 传给 permission.set；旧 HTTP RPC 没有 owner 时保持响应兼容且不向其他连接广播。
- [x] `check-browser-event-scope-smoke.js` 已注册到 `precheck`、全量 `check` 和 `check:browser`，覆盖双连接隔离、公开 payload 脱敏和 server 静态接线。
- [x] 本轮实际执行 Browser event scope smoke、Browser manager smoke 和三项 Node 语法检查，均退出码 0；`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，`git diff --check` 退出码 0（仅既有 LF/CRLF 提示）。

## R45 后续现场门

- [ ] 真实 desktop/CDP/platform Browser host 的注册、导航、登录态、恶意页面、上传/下载和断线清理。
- [ ] HarmonyOS App 全量 Browser action 与受支持平台 host 能力；第 16、23D 仍保持“部分实现”。

## R46-SERVICE-EVENT-SCOPE 已完成的源码子阶段

- [x] Workspace Service lifecycle event 现在携带运行期 owner connectionId；ServiceProxyManager 不把 owner 写入持久化 state。
- [x] 新增 `service-event-router.js` 精确单播；server 发送前移除内部 owner 字段，HTTP 兼容 RPC 没有 owner 时不向其他 WebSocket 广播。
- [x] upsert/start/stop/health/remove 的 WebSocket 入口记录 owner；服务进程 error/exit、health、stop、remove 事件复用 owner，remove 和 connection detach 清理 map。
- [x] `check-service-event-scope-smoke.js` 覆盖双连接单播、空/未知 owner 阻断、断开清理、公开 payload 脱敏和 server 静态接线；已注册到 `postcheck` 的 `check:service-event-scope`。
- [x] Service event scope smoke、Service Proxy manager smoke 和 Node 语法检查已通过。
- [x] 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`，退出码 0；新增 `check:service-event-scope` 已在 `postcheck` 执行，并与既有 precheck、主 check、R12/R13/R26/R27/R28/R29/R30/R32/R35 和 Voice platform 回归一起通过。
- [x] 本轮实际执行 `git diff --check`，退出码 0；仅有既有 LF/CRLF 转换提示，没有 whitespace error。

## R46 后续现场门

- [ ] 真实域名解析、跨 host/workspace 权限、长 HTTP/WebSocket 代理和服务进程重启恢复仍由 23C/FIELD 管理。

## R47-AUTOMATION-EVENT-SCOPE 已完成（源码子阶段）

- [x] 新增 `automation-event-router.js`，按 schedule、loop、chatRoom family 保存运行期实体/workspace 订阅；事件缺少可验证 scope 时默认丢弃。
- [x] server 的 Schedule、Loop、Chat Room lifecycle callback 改为 scoped delivery，不再调用全局 `broadcastToClients`；成功 RPC 结果才建立当前连接订阅。
- [x] Chat Room `message.created`、`ack.updated` 等事件补充 `workspaceId`；连接断开时清除 automation scope，连接重建不会继承旧订阅。
- [x] `check-automation-event-scope-smoke.js` 覆盖双连接隔离、实体/workspace scope、未知 scope、断开清理和静态接线；已注册到 `postcheck` 的 `check:automation-event-scope`。
- [x] automation event scope smoke、Schedule manager smoke、Loop manager smoke、Chat Room manager smoke 和 Node 语法检查已通过。
- [x] 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`，退出码 0；新增 `check:automation-event-scope` 已在 `postcheck` 执行。
- [x] 本轮实际执行 `git diff --check`，退出码 0；仅有既有 LF/CRLF 转换提示，没有 whitespace error。

## R47 后续现场门

- [ ] 真实多连接 App 订阅、workspace 权限变化、daemon 重启后的重新订阅和长时间 Schedule/Loop/Chat Room 现场仍需现场验收。

## R48-FILE-TRANSFER-EVENT-SCOPE 已完成（源码子阶段）

- [x] 新增 `file-transfer-event-router.js`，上传/下载 progress、completed、failed event 按 owner connectionId 精确单播，空/未知 owner 默认阻断。
- [x] FileTransferManager 由 upload/download state 携带 connection，内部 ownerId 只存在事件路由阶段；server 发送前移除 owner，不改变公开 file.transfer payload。
- [x] HTTP 兼容 RPC 没有 WebSocket owner 时仍返回同步结果；断开清理继续取消上传/标记下载，重建连接不会继承旧事件。
- [x] `check-file-transfer-event-scope-smoke.js` 已注册到 `postcheck` 的 `check:file-transfer-event-scope`，并覆盖双连接隔离、空/未知 owner 和 server/manager 静态接线。
- [x] file transfer event scope smoke、terminal/file IO smoke 和 Node 语法检查已通过。
- [x] 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；`check:file-transfer-event-scope` 已由 `postcheck` 执行。
- [x] 本轮实际执行 `git diff --check`，退出码 0；仅有既有 LF/CRLF 转换提示，没有 whitespace error。

## R48 后续现场门

- [ ] 真实大文件、弱网、浏览器/HarmonyOS App 多连接和断线重连现场仍需现场验收。

## R49-TERMINAL-EVENT-SCOPE 已完成（源码子阶段）

- [x] Terminal creator/subscriber scope、public payload 脱敏和空 scope 阻断已接线。
- [x] `terminal.updated`、`terminal.attention`、`terminal.capture.persisted` 和 `terminal.stream.exit` 不再通过全局广播；hook 更新保留 daemon 级广播。
- [x] terminal event scope smoke 已加入 `postcheck`；Bridge 全量 check 与 `git diff --check` 本轮退出码 0。

## R49 后续现场门

- [ ] 真实多连接 App、超长 terminal stream、capture 大文件、弱网断线重连和跨 host/workspace 权限现场仍需现场验收。

## R50-AUTOMATION-RUNTIME-EVENT-SCOPE 已完成（源码子阶段）

- [x] automationConnection 的 Agent/session/Provider runtime event 已按 workspace scope 单播，缺 scope 默认丢弃。
- [x] runtime scope smoke 已加入 `postcheck`；Bridge 全量 check 与 `git diff --check` 本轮退出码 0。

## R50 后续现场门

- [ ] 真实 Schedule/Loop/Chat Room 长时间 Provider 会话、多个 App workspace 订阅、daemon 重启恢复和权限变化仍需现场验收。

## R51-NOTIFICATION-HOST-SCOPE 已完成（源码子阶段）

- [x] NotificationManager 为记录保存可选 `hostProfileId`；旧记录缺少字段时归一化为空字符串，保留旧客户端无范围行为。
- [x] list/read/action/prune 均按连接 host scope 过滤；跨 host 的 read/action 返回 `not_found`，scoped prune 不会删除其他 host 的通知，并返回当前 host 的计数。
- [x] server 按 WebSocket `clientHello.hostProfileId` 分组创建 Agent/terminal 通知并计算 host 独立 unread count；内部 automation connection 按 workspace 转发到真实目标连接，不写入 `bridge-automation` host。
- [x] `check-notification-scope-smoke.js` 已加入 `postcheck`，覆盖 host A/B 隔离、legacy 无 host 兼容、跨 host 读写阻断、prune 隔离和 event draft host 标记。
- [x] 本轮实际执行 notification manager/server Node 语法检查、既有 notification smoke、新 notification scope smoke 和 `git diff --check`，均退出码 0。
- [x] 本轮实际执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，precheck、主 check 和 postcheck（含 `check:notification-scope`）退出码 0；`git diff --check` 退出码 0，仅有既有 LF/CRLF 转换提示。
- [ ] 真实多 Host App、断线补发、Push/AGC 角标和跨设备点击仍需 FIELD。

## R51 后续现场门

- [ ] 真实多 Host Profile 同 Bridge 连接下的列表、read/action/prune 和 terminal/Agent 通知隔离。
- [ ] 断线重连、Push token/角标、冷启动点击和旧 host route 的现场验证。

## R52-PUSH-HOST-SCOPE 已完成（源码子阶段）

- [x] Push subscription 记录和公开 DTO 增加可选 `hostProfileId`；原始 token 仍只留在 Bridge 本地存储，不进入 RPC。
- [x] server 将连接 host 作为 status/register/unregister 的权威 scope；跨 host unregister 不会触达其他 Host Profile 的 token。
- [x] host-scoped notification 只投递到同 host active token，异步 `notification.push.updated` 只投递到同 host 连接；无 host notification 保留 legacy 全局投递。
- [x] `check-push-notification-scope-smoke.js` 已接入 `postcheck` 的 `check:notification-push-scope`，既有 Push smoke 继续通过。
- [x] 本轮实际执行 Push manager/server Node 语法检查、Push scope/既有 smoke、Bridge 全量 check（含 postcheck）和 `git diff --check`，均退出码 0。
- [ ] AGC 权益、真机多 host token 生命周期、后台/锁屏/进程终止、失效 token、角标和跨设备点击仍需 FIELD。

## R52 后续现场门

- [ ] 如产生新的重大 HAP，现场安装目标严格限定为 `5KLBB25A10203862`，且只安装、不启动、不测试；多 host token 行为和通知点击的运行验证需用户另行授权，不能用安装结果冒充。
- [ ] AGC Push 真实服务账号、限流、失效 token 和前后台投递结果。

## R53-GITHUB-HOST-SCOPE 已完成（源码子阶段）

- [x] WebSocket 连接 host 作为 GitHub RPC 的权威 scope；有 host 时覆盖 payload，旧无 host 连接保持兼容。
- [x] OAuth device session、PR/reviewer/label/merge plan 和附件 upload plan 均保存并校验 host，跨 host、过期或重复 confirm 返回结构化失败。
- [x] PR watch key 包含 host；subscriber 记录 connection owner，连接注销时只清理该连接订阅，最后一个 subscriber 退出后停止轮询。
- [x] `check-github-host-scope-smoke.js` 已注册到 `postcheck`；覆盖 binding/plan/OAuth/watch scope 和 server 静态接线。
- [x] 本轮实际执行定向 smoke、GitHub client smoke、Bridge 全量 check 和 `git diff --check`，均退出码 0。

## R53 后续现场门

- [ ] 真实 GitHub 多账号、多 workspace、权限不足、token 撤销、限流和资产上传服务。
- [ ] 真实 WebSocket 多 Host 页面离开/断线 watch 清理，以及跨设备 App GitHub 工作台。

## R54-GITHUB-CREDENTIAL-STORE 已完成（源码子阶段）

- [x] `github-credential-store.js` 使用带超时和输出上限的受控进程执行，检查 command exit status。
- [x] OAuth secret 只通过 stdin 传入 DPAPI/Keychain/Secret Service；命令参数和公开状态不包含 token。
- [x] Windows 受管凭证写入使用临时文件 + 原子 rename，账号 key 拒绝路径穿越和控制字符。
- [x] `check-github-credential-store-smoke.js` 已加入 `postcheck` 的 `check:github-credential-store`，覆盖 stubbed platform command、stdin/args 泄漏和路径隔离。
- [x] 重新执行 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；`postcheck` 实际执行 `check:github-credential-store`。

## R54 后续现场门

- [ ] macOS Keychain、Linux Secret Service 的真实读写/权限失败与 token 撤销。
- [ ] Windows DPAPI 用户 ACL、跨用户读取失败和真实 OAuth Device Flow。

## R55-GITHUB-OAUTH-SESSION 已完成（源码子阶段）

- [x] 过期 session、终态 OAuth error、token 缺失、账号查询失败和 secure storage 失败均清理内存 session。
- [x] `authorization_pending`/`slow_down` 继续保留 session，并更新 interval/nextPollAt；重复 poll 仍返回 `poll_in_progress` 或 `poll_too_early`。
- [x] GitHub host scope smoke 使用本地 OAuth mock 覆盖过期、`access_denied`、跨 host poll 和 watch owner 清理。
- [x] 执行包含 R55 的 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；R53 host scope smoke 在 `postcheck` 中实际执行。

## R55 后续现场门

- [ ] 真实 GitHub Device Flow、token 撤销、scope 不足、拒绝和多账号切换。

## R56-GITHUB-WEBSOCKET-HOST-SCOPE 已完成（源码子阶段）

- [x] 新增真实 Bridge 子进程 + 两条 WebSocket `/ws` 连接的 host scope live smoke；`clientHello.hostProfileId` 覆盖伪造 payload，binding A/B 只能访问自身 host。
- [x] OAuth Device Flow session 的跨 host poll 被稳定阻断；PR update plan 的跨 host confirm 被阻断；watch stop 的跨 host 操作被阻断。
- [x] 连接关闭后 watch subscriber 清理已由真实重连断言锁定；同 host 重建 watch 的 subscriberCount 保持 1。
- [x] live smoke 发现并修复 `github-client.js` 中 PR update/reviewer/label/merge plan 创建时未保存 `hostProfileId` 的安全缺口。
- [x] `check-github-host-scope-live` 已注册到 `postcheck`；定向 live smoke、Node 语法、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮均退出码 0。
- [x] 本轮无 ArkTS/HAP 改动，未构建、未安装、未启动或测试设备；设备安装约束仍为仅允许 `5KLBB25A10203862` 且仅安装。

## R56 后续现场门

- [ ] 真实 GitHub Device Flow、token 撤销、scope 不足、多账号/多 workspace 权限、限流和资产上传服务。
- [ ] 真实 WebSocket 多 Host App 页面离开/断线、长 watch 和跨设备 GitHub 工作台。

## R57-DAEMON-REMOTE-CONFIG-HOST-SCOPE 已完成（源码子阶段）

- [x] `daemonConfigPayloadForConnection()` 使用当前 WebSocket `clientHello.hostProfileId` 覆盖 daemon config 请求体，status/fetch/validate/preview/apply/rollback 不接受跨连接伪造 host。
- [x] remote config apply/rollback plan 保存 hostProfileId，并继续绑定 instanceId、generation、source URL、configVersion 和 digest；跨 host confirm 返回 `host_scope_mismatch`，来源或版本变化返回 `plan_expired`。
- [x] `check-daemon-remote-config-smoke.js` 覆盖管理器级 host A/B、版本变化、source URL 变化和 rollback 隔离；新增真实 Bridge 双 WebSocket smoke 覆盖进程级连接 scope。
- [x] 本轮实际执行 Node 语法检查、两个 remote-config smoke、package JSON 解析、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check` 和 `git diff --check`；全量主 check 与 postcheck 均退出码 0，仅有既有 LF/CRLF 转换提示。
- [x] 本轮未修改 ArkTS/HAP，未构建、未安装、未启动或测试设备；后续重大 HAP 更新只允许向 `5KLBB25A10203862` 执行安装。

## R57 后续现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启、真实签名远程配置和双 Bridge rolling restart/update/rollback。
- [ ] 真实 App 多 host Fleet 操作、generation/heartbeat 连续变化和 host 切换。

## R58-DAEMON-CONFIG-CLI-MCP 已完成（源码子阶段）

- [x] 管理 CLI 已将 `daemon config status/fetch/validate/preview/apply/rollback` 映射到对应 live `RequestType`，不会在无 Bridge 时旁路本地 remote-config manager。
- [x] 无 live Bridge 时 CLI 统一返回 `live_bridge_required`；Bridge 返回 `failureCategory` 的结构化失败会设置非零退出码，同时保留 message/remediation JSON。
- [x] MCP 工具定义和映射覆盖六个 daemon config RPC；status/validate/preview 标记只读，fetch 标记 open-world，apply/rollback 标记 destructive 并要求 confirm。
- [x] 本轮实际执行 CLI/MCP 定向 smoke、Node 语法检查；随后 Bridge 全量 check（含 postcheck）和 `git diff --check` 通过。本轮未修改 ArkTS/HAP，未构建、未安装、未启动或测试设备。

## R58 后续现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启、真实签名远程配置。
- [ ] 双 Bridge rolling restart/update/rollback、真实 App Fleet 聚合和连续 heartbeat/generation 现场。

## R66-PROVIDER-USAGE-SCOPE-INTEGRITY 已完成的源码子阶段

- [x] Provider usage 请求由 Bridge connection 作用域补齐后，作为 hostProfileId/sessionId/agentId/window 的权威来源。
- [x] Provider 响应携带冲突作用域时不直接使用，结果统一覆盖为请求作用域，并返回稳定 `provider_scope_response_ignored` warning。
- [x] quota event 从归一化结果生成，验证 Host/session/agent 不会被 Provider 响应跨作用域搬移；无 scope 的旧调用仍保留兼容行为。
- [x] 定向 scope integrity smoke、R30 freshness smoke 和 Node 语法检查已通过；本轮 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，包含 `check:r66` 及既有 postcheck；`git diff --check` 退出码 0（仅有既有 LF/CRLF 提示）。
- [ ] 真实 Provider quota、长会话 compaction、账单数据和真机展示仍属于第 22/34 项 FIELD 门。

## R76-PROVIDER-USAGE-PRODUCER-INTEGRITY 已完成的源码子阶段

- [x] Codex App Server、OpenCode 和 Gateway usage normalizer 拒绝负数、分数/超安全范围 token 与负数/非有限 cost；无有效字段的事件返回 `null`，不产生空 usage event。
- [x] 只有 Provider 明确提供 total，或 inputTokens 与 outputTokens 同时存在时才输出 `totalTokens`；单侧 token、reasoning/cache-only 数据保持 unavailable。
- [x] 缺少 currency 的 cost 只保留事件级 cost，不伪造 `USD`；显式币种 trim/大写，多币种不跨币种合计。
- [x] OpenCode/Gateway 既有成功 fixture 显式声明 `currency: 'USD'`；新增 `check-provider-usage-producer-integrity-smoke.js` 覆盖单侧、缺币种、多币种、负数和全非法事件。
- [x] 本轮实际执行三类 Provider `node --check`、既有 OpenCode/Gateway usage smoke、R76 smoke、`npm run check:r76`，均退出码 0；未修改 ArkTS、未构建或安装 HAP。
- [ ] 真实 Provider 账单币种、套餐 quota、长会话 compaction 和 App/真机 Usage 展示仍由第 22/34 项 FIELD 管理。

## R77-APP-COMPATIBILITY-BUILD-METADATA 已完成的源码子阶段

- [x] App Bridge connection、hello、Push payload 和会话子窗口不再把缺失版本伪装为 `1.0.0`；真实 `versionName` 由 BundleInfo 读取后 trim，读取失败保持空值。
- [x] `check-app-compatibility-build-metadata-smoke.js` 覆盖静态调用链和 compatibility `unknown`/compatible/appTooOld 语义，`check:r77` 已进入 Bridge `postcheck`。
- [x] 本轮实际执行 R77 定向 smoke、`npm run check:r77`、Bridge 全量 `npm run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均退出码 0；HAP SHA-256 `71C84A6231CBF43719D0A5CDF496DC3210DD18D4E02F7408F73AA4250D77248A`；本轮未安装、启动或测试任何设备。
- [ ] 真实版本矩阵、BundleInfo 异常、兼容卡真机展示和 Provider/usage 现场仍由 FIELD 管理；第 22、34 项继续保持“部分实现”。

## R78-PROVIDER-CAPABILITY-INTEGRITY 已完成的源码子阶段

- [x] `ProviderRegistry` 统一把 `metadataGeneration` 绑定到实际 metadata method，把 `usageEvents` 绑定到显式 usage producer marker；静态 descriptor 不能再发布不存在的能力。
- [x] `providerUsage` 只对原生 `getUsage()` 或安全 HTTPS endpoint 发布；HTTP、URL 内嵌凭证和无效 URL 均降级为 false，保留旧 Provider 无 endpoint 的兼容行为。
- [x] Codex 非法 runtime 配置和 exec fallback 不发布 usage/metadata capability，新增 smoke 断言 invalid runtime 的 capability 为 false。
- [x] Mock、Codex App Server、OpenCode 和 Gateway 标记真实 usage producer；Codex exec runtime 不发布 usage events。
- [x] R78 runtime capability smoke 覆盖静态声明降级、Mock 保留能力、HTTPS/HTTP/凭证 endpoint 和 catalog 透传；`check:r78` 已写入 Bridge `postcheck`。
- [x] 本轮实际执行 R78 定向 syntax/smoke、`npm run check:r78`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check`，均退出码 0；本轮未修改 ArkTS/HAP，未安装、启动或测试设备。
- [ ] 真实 Provider quota/metadata、长会话 compaction 和 App/真机展示仍为第 22/34 项 FIELD 门。

## R79-PROVIDER-USAGE-AVAILABILITY 进行中

- [x] `provider-usage-service.js` 增加可选 `availabilityState`，区分 `unsupported`、`available`、`available-empty`、`failed`、`stale` 和 `loading`，并保留旧 `status`/`ok`/`stale` 字段兼容。
- [x] 未配置能力归一化为 `unsupported`；Provider runtime、HTTP、超时和响应错误归一化为 `failed`；无真实套餐数据的成功响应归一化为 `available-empty`；过期快照归一化为 `stale`。
- [x] App `AgentBridgeProviderUsageResult`、parser 和 Agent Home Provider Usage 状态文案已接入强类型状态与中英文资源；旧 Bridge 缺少字段时按旧 status/failure/stale 安全推导。
- [x] `check-provider-usage-availability-smoke.js` 已覆盖成功、空数据、unsupported、failed、stale、loading、无效状态和 service error，并注册 `check:r79`/`postcheck`。
- [x] 本轮实际执行 `npm --prefix tools/agent-bridge run check:r79`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP `entry/build/default/outputs/default/entry-default-signed.hap` 大小 `14,390,147` bytes，SHA-256 `0F979D1BB48873AED61D10E1557BCEB6ECCCF4ECD0F71A6AE7C49AF58A9EE052`。
- [x] 指定设备 `5KLBB25A10203862` 为 `Connected`；仅向该 target 执行一次 `install -r`，HDC 返回 `9568423`（签名 profile 未授权设备 UDID）。未启动应用、未读取日志、未截图或测试，也未操作其他设备。
- [ ] 真实 Provider quota、长会话 compaction、metadata 和真机展示仍属于第 22/34 项 FIELD 门。

## R80-APP-USAGE-BUDGET-CURRENCY 已完成源码子阶段

- [x] App 预算币种 draft 初始值、预算响应回填、scope 切换、清除和重置均保持空字符串表示 unavailable，不再把缺失币种伪造成 `USD`。
- [x] 成本预算仍要求显式币种；真实 Bridge 返回的币种不被改写。
- [x] `AgentBridgeM5Parser.test.ets` 增加缺失币种断言；新增 `check-app-usage-budget-currency-smoke.js` 并接入 `check:r80`/`postcheck`。
- [x] 本轮实际执行 R80 定向 Node syntax/smoke、`npm run check:r80` 和 `git diff --check`，均退出码 0。
- [ ] 本轮未执行 SDK 23 HAP 构建或设备安装；R80 是预算缺省值语义修正，不属于重大功能更新。

## R80 后续现场门

- [ ] 真实 Provider 币种/账单与套餐 quota、长会话 compaction、metadata 生产链和真机 Usage/Diagnostics 展示仍待第 22、34 项 FIELD 验收。

## R81-METADATA-USAGE-ACCOUNTING 已完成的源码子阶段

- [x] Codex metadata turn 现在保留完成 turn 的 usage 快照；Bridge 将其规范化为 `kind=metadata`，按当前 host/session/agent 记录到 UsageManager，并发送同 host 的 `usage.updated`。
- [x] metadata usage normalizer 拒绝负值、非安全整数、非法 cost/currency 和无效时间；没有有效数值时保持结果可用但不产生 usage event。
- [x] 重复 metadata event id 继续使用 UsageManager 幂等去重；Mock usage 只在显式测试环境开关下启用，不改变 R28 默认事件数量。
- [x] `check-metadata-usage-accounting-smoke.js`、metadata scope、usage metadata live、`npm run check:r81` 本轮均退出码 0，并已将 R81 纳入 `postcheck`。
- [ ] 本轮未修改 ArkTS、未构建或安装 HAP；真实 Provider 账单权限、长会话重启恢复及指定真机 Usage/Diagnostics 展示仍待 FIELD。

## R35 后续现场门

- [ ] 连接真实旧 Bridge/新 Bridge 验证 minimum-only、缺协议、协议不兼容、建议升级和 blocking 矩阵。
- [ ] 在指定真机上确认兼容卡和诊断导出展示；不改用其他设备。

## R69-BROWSER-PERMISSION-STATE 已完成的源码子阶段

- [x] Bridge `BrowserAutomationManager.publicPermissionState()` 将 workspace/domain permission、下载目录受管状态和更新时间收敛为脱敏 DTO；`browser.permission.get`、permission preview/confirm 与 `browser.permission.updated` 事件复用该 DTO。
- [x] App 增加 `AgentBridgeBrowserPermissionState` 和 `AgentBridgeBrowserResult.permission`，parser 兼容嵌套 permission、旧扁平字段和缺字段默认值；Browser 面板只展示域名 allowlist、下载目录是否受管和更新时间，不展示绝对路径。
- [x] App 主动查询、permission updated 事件、host/workspace 切换清理和当前 workspace 校验已接线；旧 Bridge 仍保留既有 Browser/profile 能力。
- [x] `node scripts/check-browser-automation-manager-smoke.js`、`node scripts/check-protocol-alignment-smoke.js`、Bridge 全量 `npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 均通过；HAP SHA-256 `10B28A1F2ABC9B5C0DFE8D4EAA0CC0E1230A2D4627C97A5E76ADFA0799BEFBB3`。
- [x] 设备边界已按用户限制记录：`5KLBB25A10203862` 查询为 Offline，未安装、启动、测试或读取日志；在线设备 `2UCUT24724009680` 未使用。
- [ ] 真实平台 Browser host、HarmonyOS App 全量动作、恶意页面/登录态、上传下载和真机现场仍待 FIELD；第 16、23D 不因本源码子阶段关闭。

## R71-BROWSER-DOWNLOAD-PATH-BOUNDARY 已完成的源码子阶段

- [x] `BrowserAutomationManager.permissionGet()` 的历史顶层 `downloadDirectory` 字段改为固定相对标识 `.agent-bridge-downloads`；嵌套 `permission` DTO 和事件继续只公开 `downloadDirectoryConfigured`。
- [x] Bridge 内部 Browser action command payload 仍使用当前 workspace 受管下载目录的绝对路径，确保 CDP 下载行为不受影响。
- [x] `BrowserAutomationManager.handleHostResult()` 对 `page.action`/`download` 与 `download.list` 清理外部 host 返回的 `downloadDirectory`、`downloadPath`、`filePath`、`path` 和 `filePaths`，公开结果只带相对 marker、文件元数据或配置状态；`BrowserCdpHost` action/list 同步返回脱敏结果。
- [x] manager、CDP host、Bridge live 和 protocol alignment smoke 以及 Node 语法检查均通过；本阶段没有 ArkTS/HAP 修改，因此没有设备安装操作。
- [ ] 真实平台 Browser host、恶意页面/登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD；第 16、23D 继续保持“部分实现”。

## 证据规则

1. 只记录当前轮实际执行的命令和退出结果；历史证据保留为历史，不冒充本轮通过。
2. `npm run check` 只证明已注册的自动化；不替代真机、真实服务、跨平台和长时运行现场验证。
3. 任何 Web/API 或安全边界修改都必须同步更新协议、README/架构说明和对齐清单中的事实描述。
4. 保留工作区既有用户改动；不执行 `git reset --hard`、`git checkout --` 或 `git clean`。
5. ArkTS 未修改时不重复构建；如本阶段进入 `.ets`，先复核命中的 ArkTS/UI/窗口规则，再按任务要求执行 SDK 23 构建。

## R97-ENCRYPTED-SETTINGS-SECURE-MASTER-KEY 已完成（源码子阶段）

- `EncryptedSettingsStoreFacade` 不再包含固定静态主密钥；新密钥通过 `ngfKeyStoreManagerFacade` 写入 AssetStoreKit 稳定 alias，普通 AppStorage 不再保存新主密钥。
- 启动先读取安全 alias；旧 `ngf_encrypted_master_key` 只在安全写入成功时迁移并清空。安全查询、随机数或迁移失败时统一标记 `secure_storage_unavailable`，加密设置读写返回安全默认值/跳过写入，不继续使用明文或静态 key。
- `NGFEncryptedSettingsStoreStatus` 和 `getStatus()` 只公开 ready、storage 和稳定 failure category；不公开密钥、alias 内部实现细节或路径。
- 新增 `tools/agent-bridge/scripts/check-encrypted-settings-store-smoke.js`，覆盖安全门面导入、稳定 alias、迁移清理、fail-closed 和固定 key 缺失，并接入 `postcheck`。
- 本轮实际执行 `npm --prefix tools/agent-bridge run check:encrypted-settings-store`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0；HAP 14,429,593 bytes，SHA-256 `AD93C3589F9EAA294A34B3369C196E3C379D772A0BCD206EF78CF5639FF890CD`。仅保留既有 ArkTS syscap、弃用 API 和异常处理警告。
- 本轮未连接、安装、启动或测试设备；跨平台安全存储适配器、历史加密数据迁移和真机行为仍需现场验证，第 16 项保持“部分实现”。

## 当前阻塞与边界

- R6 binary terminal 的平台渲染和长流现场尚未证明，不能只因 Bridge 已有 binary frame manager 就关闭 23B。
- R7 缺少可真实宣称的 Electron/HarmonyOS/其他受支持 Browser host；普通 Web UI 虽已具备完整控制端，但不等同于 Browser host，HarmonyOS App 仍缺全量动作入口。
- 真实 Provider quota/compaction/metadata、Voice 设备路由、跨平台 daemon、多 Bridge、AGC Push 和公网 Relay 继续作为现场门。

## 变更记录

| 日期 | 事件 | 结果 |
|---|---|---|
| 2026-08-08 | 建立持续推进总目标与本阶段监督文件 | R6-WEB-2 进入进行中，R6/R7/现场边界按当前源码重列 |
| 2026-08-08 | R6-WEB-2 首批源码闭环 | Web terminal V2 binary、workspace files/download、Git stage/unstage/commit/pull/push/discard 与 `workspaceFiles` capability 已接入；contract/live smoke 及 Bridge 全量 `npm run check` 通过 |
| 2026-08-08 | R6-WEB-2 Git 控制面扩展 | Web branch/stash/merge 已接入同一 mutation executor；branch delete、stash pop/drop、merge 继续强制 Bridge preview/planId/confirm；contract/live smoke 与全量 check 通过 |
| 2026-08-08 | R6-WEB-2 settings/doctor 收口 | Web 新增诊断状态模型、八组分组渲染、compatibility/remediation 降级、`daemon.status`/`daemon.health`/`workspace.registry.doctor`/`diagnostics.export` 请求和 JSON/text 导出；新增 diagnostics smoke、Web contract/live smoke 与 Bridge 全量 `npm run check` 通过 |
| 2026-08-08 | R6-WEB-2 Git/Diff 多模式收口 | Web 增加 summary/files/unified 视图、当前文件分页游标缓存和切换复用；Web contract/live 与 Bridge 全量 `npm run check` 再次通过 |
| 2026-08-08 | R6-WEB-3 多标签源码起步 | Web 加入不携带凭证的 BroadcastChannel workspace/session 刷新与注销协调；contract/live smoke 与 Bridge 全量 `npm run check` 再次通过，真实双标签、旧 Bridge 和长流仍待现场 |
| 2026-08-09 | R65 Web 多标签 scope 收口 | BroadcastChannel 增加 endpoint/hostProfileId/payload scope 过滤，workspace/session/scope 事件改为局部刷新；新增 `check-web-multitab-scope-smoke.js` 并接入 `check:r65`/`postcheck`，定向与 Bridge 全量 check 退出码 0；真实多标签、旧 Bridge、长流和 WebView 仍待 FIELD |
| 2026-08-08 | R6-WEB-2 GitHub 工作台收口 | Web 接入 OAuth Device Flow 状态与受控轮询、账号切换、workspace/repository binding、PR 分页/详情/更新/reviewer/label/merge、checks/watch 生命周期和附件 preview/upload capability gate；新增 `check-web-github-smoke.js`，定向 smoke 与 Bridge 全量 `npm run check` 退出码 0 |
| 2026-08-08 | R7 Web Browser 控制面收口 | Web 接入 host/instance/page 生命周期、导航、snapshot/screenshot/logs/wait/download、全部 action 与 permission；新增 capability/path 合同断言，Web contract/live、Browser manager/CDP/live/protocol、`npm run check:browser` 和 Bridge 全量 `npm run check` 退出码 0；平台 host、HarmonyOS App 全量操作和真实浏览器现场继续由 FIELD 验收 |
| 2026-08-08 | R8 HarmonyOS App Browser 异步状态收口 | App Browser parser 增加 request ID，pending RPC 按 ID 防乱序；清理 host/页面生命周期旧请求；截图预览加入 MIME/8 MiB 限制；Browser 定向 smoke、Bridge 全量 check 与 SDK 23 HAP 构建通过。指定设备 `5KLBB25A10203862` 安装因签名 profile 未授权 UDID 失败，未启动或测试；真实 host/App 全量动作仍待 FIELD |
| 2026-08-08 | R9 Usage 事件隔离与持久恢复 | 新增 scoped usage event router；`usage.updated` 按 host 同步，legacy 无 host 客户端只回源连接；budget warning 透传来源连接；新增 recovery smoke 覆盖 actual/estimated、token 分类、quota、compaction、session/day/month、去重和重启恢复。usage scope/recovery smoke 与 Bridge 全量 `npm run check` 本轮均通过；第 22、34 项仍为部分实现 |
| 2026-08-08 | R10 Web 生命周期源码收口 | `app.js` 增加 `reconnectEnabled`、`pageClosing`、`connectionGeneration`、`refreshInFlight` 和 `shutdownTransport()`；pagehide、显式/跨标签 logout 会释放 timer、watch、terminal subscription、pending RPC 与 BroadcastChannel；刷新阶段按连接代际丢弃迟到结果，重新登录可恢复 transport。Web contract/live 与 Bridge 全量 `npm run check` 本轮通过；23B/23D 的真实浏览器、旧 Bridge、长流和平台 host 仍待 FIELD |
| 2026-08-08 | R11 Web workspace registry 源码收口 | `index.html` 增加 Import/status，`app.js` 接入 workspace.registry.import/open/archive 的 preview/confirm、busy guard、错误 remediation 和归档后 active 选择；Web contract/live 与 Bridge 全量 `npm run check` 本轮退出码 0。未执行 HAP 构建或设备安装；真实浏览器、多标签、旧 Bridge 和长流继续由 FIELD |
| 2026-08-08 | R12 Usage/Metadata scope 与 Provider quota endpoint 源码子阶段 | 新增 metadata scope/白名单/脱敏 helper，扩展 Provider HTTPS usage endpoint、环境 token、HTTPS 重定向和结构化失败；metadata scope、usage endpoint、既有 provider usage、protocol alignment smoke 与 Bridge 全量 `npm run check` 本轮通过。`check:r12` 已注册为 postcheck；真实 Provider、App/真机现场仍待执行。未生成或安装 HAP。 |
| 2026-08-08 | R13 Web 旧 Bridge 兼容归一化 | 新增 `src/web/compatibility.js` 并接入 `app.js`/`index.html`；统一 feature gate、旧 attach/timeline 与 workspace registry fallback、optional RPC failure、未知事件和 scope 过滤。compatibility、Web contract/live smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check`（含 postcheck R12/R13）本轮退出码 0；未生成或安装 HAP，真实旧 Bridge/多标签/长流/浏览器现场继续待 FIELD。 |
| 2026-08-08 | R14 Voice endpoint 与 capability 契约收口 | `VoiceManager` 统一拒绝非 HTTPS/带凭证/fragment endpoint；`voice.status` 默认不宣告 Bridge 本机 audio capture/playback、VAD 或 interruption handling，并以脱敏 warning code 报告配置错误；App parser 增加 warnings。Voice smoke、Bridge 全量 `npm run check` 与 SDK 23 `assembleHap --no-daemon --stacktrace` 退出码均为 0；HAP 仅向 `5KLBB25A10203862` 尝试安装，因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；真机音频路由和真实 Provider 继续待 FIELD。 |
| 2026-08-08 | R15 Provider usage/metadata contract 源码子阶段 | usage unavailable/error/failed 状态归一化为 `ok=false`；认证 usage endpoint 禁止跨 origin HTTPS 重定向；Codex App Server 增加结构化 metadata alternatives，Bridge 返回 alternatives/warnings/estimatedUsage 可选字段并保持旧字符串 Provider 兼容。Provider usage、endpoint、Codex provider 定向 smoke 通过；未生成或安装 HAP，真实 Provider 和现场 App 数据仍待 FIELD。 |
| 2026-08-08 | R16 Browser host result integrity 源码子阶段 | Bridge 过滤不可信 host result 的权威/失败/原型键并保持一次性 command pending；Browser manager/CDP/live/protocol smoke 与 Bridge 全量 `npm run check` 本轮通过，平台 host、App 全量动作和真实浏览器现场仍待 FIELD |
| 2026-08-08 | R17 Remote config URL integrity 源码子阶段 | remote config fetch/download 共用 credential-free HTTPS URL 校验并拒绝不安全重定向；remote-config smoke 与 Bridge 全量 `npm run check` 本轮通过，跨平台 daemon 与真实签名配置现场仍待 FIELD |
| 2026-08-08 | R18 Voice remote capture isolation 源码子阶段 | `VoicePlatformFacade` 在 `remote_stt` 下不再写入或结束本地 CoreSpeechKit；新增 platform contract smoke 并接入 `postcheck`，Bridge 全量 `npm run check` 与 SDK 23 HAP 构建通过。仅向 `5KLBB25A10203862` 安装，因签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；真机音频路由和真实 Provider 继续待 FIELD |
| 2026-08-08 | R19 Fleet target integrity 源码子阶段 | 新增 `daemon-target-guard`，Bridge lifecycle handler 与 App Fleet coordinator 绑定 host/instance/generation；target guard smoke、Bridge 全量 `check`、SDK 23 HAP 和 `git diff --check` 本轮通过。仅向 `5KLBB25A10203862` 尝试安装，签名 profile 未授权 UDID 返回 `9568423`，未启动或测试；双 Bridge/跨平台 rolling 继续待 FIELD |
| 2026-08-08 | R20 Browser action Preview/Confirm 快照源码子阶段 | App 保存完整 Browser action payload 快照，Confirm 不再重读可变 UI 输入；新增 protocol alignment 断言，Bridge 全量 `check` 与 SDK 23 HAP 构建本轮通过。未重复设备安装；真实 platform host、HarmonyOS 全量动作和上传下载继续待 FIELD |
| 2026-08-08 | R21 Provider quota snapshot 生产链 | `provider.usage.list` 成功刷新后将真实 quota 窗口转换为 host/session/agent/provider scoped `kind=quota` Usage event；内容摘要 eventId 保证重复刷新幂等，Usage summary 可恢复 remaining/limit/resetAt，并通过 `usage.updated` 通知同 host 连接；Provider 文本进入 RPC/持久化前做长度限制与 token/private-key 脱敏。Provider usage smoke 与 Bridge 全量 `npm run check`（含 R12/R13/voice-platform postcheck）退出码 0；未生成/安装 HAP，真实 Provider quota/长会话/现场数据继续待 FIELD |
| 2026-08-08 | R22 Browser host capability metadata 与 readiness | Browser host 公开可选 hostKind/runtime/capabilitySource/readiness/supportedPlatforms/capabilityWarnings；显式 HarmonyOS host 必须声明 platform capability source，非 ready host 只展示不 dispatch；server feature 明确 `browserHostCapabilityMetadata=true`、`browserPlatformHost=false`；CDP host 发布 cdp/chromium/ready metadata。manager/CDP/protocol 定向 smoke 退出码 0；未生成/安装 HAP，真实平台 host、HarmonyOS App 全量动作和恶意页面现场仍待 FIELD |
| 2026-08-08 | R23 Voice capture lifecycle | `VoicePlatformFacade` 增加 AudioCapturer generation/identity gate、匹配 callback 注销和 AudioSession deactivation listener cleanup；Voice platform smoke、Bridge 全量 `npm run check` 与 SDK 23 HAP 构建退出码 0。指定设备 `5KLBB25A10203862` 为 Offline，未安装、启动或测试；真机音频路由和真实 Provider 继续待 FIELD |
| 2026-08-08 | R24 Voice 字段与 Provider 输出校验 | VoiceManager/VoicePlatformFacade 增加 MIME allowlist、采样 profile、语言、transcript 长度、TTS 格式和 Provider 错误脱敏校验；Voice manager/platform 定向 smoke、Bridge 全量 `npm run check` 和 SDK 23 HAP 构建退出码 0。HAP SHA-256 `FCBCCACB88ECB9E50606D9E8FA424DBB7DBDACF6CF0DD496EA987D53F9C9EA08`；指定设备 Offline，未安装、启动或设备测试，真实语音现场继续待 FIELD |
| 2026-08-08 | R25 Usage / Metadata 结果完整性 | Provider usage quota 数值不再将负值夹成 0；metadata kind/result 统一校验、长度限制、去重、截断 warning 和错误脱敏；Provider usage/metadata scope 定向 smoke 与 Bridge 全量 `npm run check` 均退出码 0，真实 Provider 与 App 现场继续待 FIELD |
| 2026-08-08 | R26 Metadata request integrity | Bridge/App/MCP/CLI 完成 metadata requestId、timeout、cancel、连接断开清理和 scope 校验；metadata request smoke 与 Bridge 全量 `check` 退出码 0。SDK 23 HAP 构建修复 parser 字段归属后退出码 0，SHA-256 `4D0C10F68CC4C2C164AD532B902B21EE7F6DE55CAA34E6C954A4B78D3CF2D753`；指定设备 Offline，未安装、启动或测试，真实 Provider/真机现场继续待 FIELD |
| 2026-08-08 | R27 Metadata WebSocket disconnect cleanup | 修正 R26 证据边界，新增真实 `/ws` 断开 smoke；`check:r26`、`check:r27` 与 Bridge 全量 `npm run check` 均退出码 0，未修改 ArkTS、未生成 HAP、未执行设备安装 |
 | 2026-08-08 | R28 Usage / Metadata live lifecycle | Mock Provider WebSocket live smoke 覆盖 actual/estimated/quota/compaction、budget warning、四种 metadata、host 隔离和重连；修复 usage 缺失 agentId 时的权威 Agent 补齐；定向 smoke 与 Bridge 全量 `npm --prefix tools/agent-bridge run check` 均退出码 0，真实 Provider/真机继续待 FIELD |
| 2026-08-08 | R29 Usage event normalization | UsageManager 统一拒绝非法 token/quota/compaction/cost 数值，单侧 token 不再推导 total；R29 定向 smoke、usage recovery smoke、Bridge 全量 `npm --prefix tools/agent-bridge run check` 和 `git diff --check` 均退出码 0，真实 Provider/真机继续待 FIELD |
| 2026-08-09 | R32 Remote config state integrity | remote config schema、启动 reconcile、摘要漂移、损坏 previous rollback guard 和 state_persist_failed 结构化错误已接线；R32 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 与 `git diff --check` 均退出码 0 |
| 2026-08-09 | R34 Compatibility protocol summary | `AgentBridgeCompatibilityInfo`、serverInfo parser 和兼容卡补齐 minimum/recommended/supported protocol 摘要；Bridge diagnostics smoke、全量 `check`、SDK 23 HAP 构建和 `git diff --check` 通过，HAP SHA-256 `730A331A6A8BEAEEDF20D4CA3EC0B809474D2ABA6FFC4FE16BC4AF97CF5F5089`。仅向 `5KLBB25A10203862` 安装一次，HDC `9568423`（签名 profile 未授权 UDID），未启动或测试；第 34 项仍保持部分实现，真实版本矩阵和真机展示继续待 FIELD。 |
| 2026-08-09 | R35 Compatibility matrix | `buildCompatibilityInfo()` 增加 minimum-only 协议比较和 unknown 降级；compatibility matrix、diagnostics、Agent Experience smoke 和 Bridge 全量 check（含 `check:r35`）退出码 0；未修改 ArkTS、未构建或安装 HAP。 |
| 2026-08-09 | R37 Voice playback generation | 远程 TTS `AVPlayer` 回调绑定 generation/player identity，释放使用同一 callback 注销并由 contract smoke 覆盖；Voice smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 退出码 0，HAP SHA-256 `F378C3863E3CA8DF22CF9DF1073E54F1DAFFB3EEB8B62AD0CC39CD20EDA4143D`。本轮未安装、启动或测试设备，真实语音现场继续待 FIELD。 |
| 2026-08-09 | R38 Voice TTS cancellation | TTS request 增加 cancelled/identity gate，stop、owner detach、shutdown 后 Provider 迟到结果不再发布 `tts.ready`；取消竞态 smoke 与 Bridge 全量 check（含 postcheck）退出码 0。本轮未修改 ArkTS、未构建或安装 HAP，真实 Provider/真机继续待 FIELD。 |
| 2026-08-09 | R40 Message Queue Attempt Integrity | Message queue state 迁移到 attempt-aware schema v2；首次 drain 创建 attempt，失败 retry 保留 queue/client id 并生成新的 `attemptId`/`retryOfAttemptId`，重复 enqueue、重载和 accepted 清理均有断言；App parser 增加可选 attempt history。Agent Experience smoke、Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check` 通过；HAP SHA-256 `C36BA685E954A06001B68458AF6481AAD38A9DAAB7B91798B7CECE6D70B1DCF1`；ArkTS 仅有既有警告，本轮未安装、启动或测试设备，真实 Provider/真机队列仍待 FIELD。 |
| 2026-08-09 | R47 Automation event scope | Schedules/Loops/Chat Rooms lifecycle event 从全局广播改为按成功 RPC 结果建立的实体/workspace 订阅单播；Chat Room 事件补 workspace scope，断开清理订阅。automation scope 与三个 manager smoke、Node 语法检查、Bridge 全量 check（含 postcheck）和 `git diff --check` 均退出码 0；真实多连接现场继续待 FIELD。 |
| 2026-08-09 | R48 File transfer event scope | 文件上传/下载 progress/completed/failed event 从全局广播改为发起 connection owner 单播；server 剥离内部 owner，断开继续清理传输状态。file-transfer scope、terminal/file IO、Bridge 全量 check（含 postcheck）和 `git diff --check` 均退出码 0；真实大文件、弱网和 App 多连接现场继续由 FIELD 管理。 |
| 2026-08-09 | R49 Terminal event scope | Terminal lifecycle event 从全局广播改为 creator/subscriber connection 单播；server 剥离内部 owner/subscriber，attention notification 只在存在目标连接时创建；terminal event scope、terminal/file IO、Bridge 全量 check（含 postcheck）和 `git diff --check` 均退出码 0，真实长流与多连接现场继续由 FIELD 管理。 |
| 2026-08-09 | R50 Automation runtime event scope | automationConnection 的 Agent/session/Provider runtime event 从全局广播改为 workspace scope 单播；缺少 workspace 且无法由 agent/session 解析时丢弃。runtime scope、R47 scope、三个 automation manager smoke、Bridge 全量 check（含 postcheck）和 `git diff --check` 均退出码 0，真实长会话现场继续由 FIELD 管理。 |
| 2026-08-09 | R53 GitHub host scope | GitHub RPC 由连接 host 作为权威 scope；OAuth session、PR/附件 plan 和 watch subscriber 按 host/connection 隔离，断开时清理 watch；GitHub host scope、既有 GitHub client smoke 与 Bridge 全量 check 退出码 0。 |
| 2026-08-09 | R54 GitHub credential store | credential store 改为带超时和退出状态检查的受控执行，token 仅经 stdin，DPAPI 文件原子写入并阻断账号路径穿越；credential store smoke 已纳入 postcheck，Bridge 全量 check 与 `git diff --check` 退出码 0。 |
| 2026-08-09 | R56 GitHub WebSocket host scope | 真实 Bridge 子进程 + 两条 WebSocket `/ws` 连接验证 `clientHello.hostProfileId` 权威覆盖、binding/PR plan/watch 跨 host 阻断、OAuth session 跨 host poll 和断线 watch 清理；修复 PR update/reviewer/label/merge plan 未保存 host 的缺口。live smoke、`npm run check:github-host-scope-live`、Bridge 全量 check 和 `git diff --check` 退出码 0；真实 GitHub/多 Host App/限流/资产服务继续待 FIELD。 |
| 2026-08-09 | R57 Daemon remote config WebSocket host scope | `daemon.config.*` 请求由当前连接 `clientHello.hostProfileId` 作为权威 scope；apply/rollback plan 绑定 host、instance、generation、source URL、configVersion 和 digest。管理器 smoke 与真实 Bridge 双 WebSocket smoke 覆盖跨 host confirm 阻断、同 host confirm、来源/版本漂移失效和 rollback 隔离；定向 smoke 通过并已接入 `postcheck`。本轮未修改 ArkTS/HAP、未安装设备，跨平台 daemon/双 Bridge rolling 继续待 FIELD。 |
| 2026-08-09 | R58 Daemon config CLI/MCP | 管理 CLI 完成 daemon config 六个 live RPC 映射与结构化失败退出码；MCP annotations 对齐只读/open-world/destructive 风险，未确认 apply/rollback 在触达 Bridge 前阻断。CLI/MCP live smoke、语法检查、Bridge 全量 check 和 `git diff --check` 通过；本轮未修改 ArkTS/HAP 或设备。 |
| 2026-08-09 | R66 Provider usage response scope integrity | Provider usage 请求 scope 成为 host/session/agent/window 权威，冲突响应被覆盖并返回 `provider_scope_response_ignored`；新增 scope integrity smoke 并接入 `check:r66`/`postcheck`。定向 smoke、R30 freshness、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 均退出码 0；Node/Bridge-only，本轮未构建或安装 HAP。 |
| 2026-08-09 | R67 Daemon remote config App closure | App 远程配置结果补齐 active/previous/fetched、摘要、验证、降级、作用域、覆盖字段和更新时间；客户端 daemon config RPC 支持显式 hostProfileId；设置区增加 status/validate/preview/rollback、确认信息、重启提示、失败 remediation 和来源隐藏，成功 apply/rollback 自动刷新状态；新增 parser 兼容测试与 `docs/agent-bridge-r67-daemon-config-app-progress.md`。Bridge 全量 `npm --prefix tools/agent-bridge run check`、`git diff --check`、SDK 23 HAP 构建（`BUILD SUCCESSFUL in 38 s 622 ms`，SHA-256 `B16CCBA3A950C71665B28E257EAAF8195D6CF4C43635C1D1D0A958791D75370F`）通过；指定设备 `5KLBB25A10203862` 为 Offline，未安装、启动或测试。跨平台 daemon、真实签名 endpoint 和双 Bridge rolling 继续待 FIELD。 |
| 2026-08-09 | R69 Browser permission state | Bridge/App 形成脱敏 permission DTO、下载目录配置状态、事件更新和 workspace 生命周期清理；Browser manager/protocol alignment smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 通过，HAP SHA-256 `10B28A1F2ABC9B5C0DFE8D4EAA0CC0E1230A2D4627C97A5E76ADFA0799BEFBB3`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；真实平台 host、上传下载和真机动作仍待 FIELD。 |
| 2026-08-09 | R70 Voice permission semantics | `NGFVoicePermissionRemediation`、VoicePlatformFacade 授权成功/拒绝语义、Agent Home remediation 文案和 Voice parser/contract smoke 已接线；Voice 定向 smoke、Bridge 全量 check、SDK 23 HAP 构建和 `git diff --check` 通过；HAP SHA-256 `34D84AFBC3B17E6AB70F9BEFFED9D2663E9B9494E652AD2BB5E9161DF85A90C5`。指定设备 `5KLBB25A10203862` Offline，未安装、启动或测试；真机语音现场仍待 FIELD。 |
| 2026-08-09 | R71 Browser download path public boundary | 修正 permission 顶层兼容字段、CDP download action/list result 和外部 host result 的绝对工作区路径泄露；内部 command payload 仍使用绝对受管目录，公开只返回 `.agent-bridge-downloads` 或文件元数据。manager/CDP/live/protocol smoke 与 Node 语法检查均通过；无 HAP/设备操作。真实 Browser host、上传下载和 HarmonyOS App 全量动作仍待 FIELD。 |

| 2026-08-09 | R72 Browser download URL public boundary | 外部 Browser host 与 CDP `download.list` 的公开下载记录只保留无凭证 HTTP(S) URL；`user:password@host`、控制字符、非 HTTP(S) 或超长 URL 会从公开 DTO 移除，内部 command payload 不变。manager/CDP/live/protocol 定向 smoke、Node 语法检查、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check` 本轮通过；未修改 ArkTS/HAP、未安装设备。真实平台 host、恶意页面、登录态、上传下载和 HarmonyOS App 全量动作仍待 FIELD |
| 2026-08-09 | R73 Daemon public surface | `daemon.status`/`daemon.health`/`daemon.logs` 公开 DTO 固定 config/log marker，managed process 记录移除 command/args/cwd/完整 identity，日志底层错误转换为稳定 warning；新增 `check-daemon-public-surface-smoke.js` 覆盖预置绝对路径记录与三类 RPC。实际执行 Node 语法检查、定向 smoke、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check` 均退出码 0；全量 check 包含主链及全部 postcheck。本轮未修改 ArkTS/HAP、未安装设备。 |
| 2026-08-09 | R74 Daemon update public surface | `publicDaemonUpdateStatus()` 统一裁剪 daemon health/status 嵌套 update 与独立 `daemon.update.status` 的 path/cwd/command/args/environment/credential 字段，state/staged/backup/development root 使用固定 marker；public-surface smoke 预置私有 update state 并验证无临时 home 泄露。Node 语法检查、public-surface smoke、daemon supervisor live smoke、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check` 均退出码 0。未修改 ArkTS/HAP、未安装设备。 |
| 2026-08-09 | R75 Bridge check-chain | `check:r75` 将远程配置 `check:r32`、Docker contract smoke 和 Docker runtime smoke 接入 `postcheck`；定向 R75 与 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 均退出码 0，runtime 默认按 opt-in 规则输出 skipped，静态 Docker contract 和远程配置通过；`git diff --check` 通过。`AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 的镜像构建/容器重启未计为本轮通过证据；本轮未修改 ArkTS/HAP、未安装设备。 |
| 2026-08-09 | R97 Encrypted settings secure master key | `EncryptedSettingsStoreFacade` 改为 AssetStoreKit 唯一持久化主密钥，旧 AppStorage 值仅在迁移成功后清空，安全存储不可用时 fail closed；新增 smoke 并接入 `postcheck`。定向 smoke、Bridge 全量 check、SDK 23 HAP 和 `git diff --check` 退出码均为 0；HAP SHA-256 `AD93C3589F9EAA294A34B3369C196E3C379D772A0BCD206EF78CF5639FF890CD`。未连接、安装或操作设备；跨平台安全存储和真机迁移仍待 FIELD。 |

## R70-VOICE-PERMISSION-SEMANTICS 已完成的源码子阶段

- [x] `NGFVoicePermissionRemediation` 作为 media contract 共享导出；授权成功将 `microphonePermission` 置为 `granted` 并清理 remediation/failure/message，拒绝固定为 `permission_denied` 与 `open_app_permission_settings`。
- [x] Agent Home voice composer 使用 `NGFVoicePermissionState` 和 `NGFVoicePermissionRemediation` 判断拒绝状态，并通过 `agent_home_voice_permission_remediation` 中英文资源展示受控 remediation，不显示平台内部路径。
- [x] `AgentBridgeVoiceParser.test.ets` 使用共享常量验证权限状态；`check-voice-platform-contract-smoke.js` 断言平台成功/拒绝路径、App 常量接线和本地化资源。
- [x] 本轮实际执行 Voice 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace`、资源校验和 `git diff --check`，均通过；构建仅保留既有 syscap、弃用 API 和异常声明警告。
- [ ] 真机权限撤销/恢复、蓝牙/耳机路由、来电抢占、前后台切换、弱网长录音和真实 STT/TTS Provider 仍需现场验收，不以本轮源码验证替代。

## R70 指定设备安装边界

- [x] 构建完成后仅查询 `5KLBB25A10203862` 状态；HDC 返回 `Offline`，因此未执行安装。
- [x] 未向其他设备执行安装；未启动应用、未读取日志、未截图、未执行设备测试。

## R82-USAGE-AGGREGATE-INTEGRITY 已完成（源码子阶段）

- [x] Usage summary quota 聚合键增加 Provider window，多个窗口不再互相覆盖。
- [x] token/cost 聚合增加安全边界；不可安全表示的溢出结果保持 unavailable，不返回 `Infinity` 或截断值。
- [x] budget token 上限拒绝小数和超安全范围输入，合法非负安全整数保持兼容。
- [x] 新增 `check-usage-aggregate-integrity-smoke.js`，覆盖预算边界、双 quota window、聚合溢出和重载恢复；`check:r82` 已接入 `postcheck`。
- [x] 本轮实际执行定向 smoke、usage normalization/recovery/provider usage smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 和 `git diff --check`，均退出码 0；本轮无 ArkTS/HAP 改动，未安装、启动或测试设备。

## R82 后续现场门

- [ ] 真实 Provider 多窗口账单、quota reset、长会话 compaction 和 metadata 生产链。
- [ ] 指定设备 `5KLBB25A10203862` 的 Usage/Diagnostics 展示确认；如需安装只允许安装，不启动或测试，且不操作其他设备。

## R83-USAGE-QUOTA-ORDER 已完成（源码子阶段）

- [x] 同一 Provider/source/window 的 quota summary 按 `occurredAt` 选择最新快照，迟到旧事件不会回退可见值。
- [x] 相同或无效时间使用稳定 `eventId` tie-break，事件历史仍追加保留，其他窗口继续隔离。
- [x] `check-usage-quota-order-smoke.js` 已覆盖乱序事件、双窗口和重载恢复，并接入 `check:r83`/`postcheck`。
- [x] 本轮定向 smoke、R82 usage 回归、Bridge 全量 check 和 `git diff --check` 均通过；本轮无 ArkTS/HAP 改动，未安装、启动或测试设备。

## R84-APP-QUOTA-WINDOW 已完成（源码子阶段）

- [x] App quota parser 从 summary/budget 的受限窗口归一化中分离，保留安全 Provider 自定义窗口（例如 hour、rolling-7d）。
- [x] quota window 拒绝空值、控制字符、Unicode 行分隔符、路径分隔符、. / .. 和超长值；非法值保持 unavailable。
- [x] Agent Home 对安全未知 quota window 显示 Provider 名称，不再将其错误归类为 session。
- [x] AgentBridgeM5Parser.test.ets 增加自定义、路径穿越、反斜杠、控制字符和长度上限断言。
- [x] 本轮定向 Usage 回归与 Bridge 全量 check（含 R82/R83 postcheck）退出码 0；SDK 23 HAP assembleHap 退出码 0，产物 SHA-256 为 B8452ACCE84DF27E0B9E7D35F852FDF93A04D158C15209C9742654060DA0591E；git diff --check 无实际空白错误。
- [ ] 第 22、34 项仍保持“部分实现”；真实 Provider、长会话、Usage/Diagnostics 真机展示继续作为现场门。

## R84 后续现场门

- [ ] 真实 Provider 的 hourly/custom quota 与跨重连刷新顺序。
- [ ] 指定设备 5KLBB25A10203862 的 Usage/Diagnostics 展示确认；若后续判断为重大 App 功能更新，只向该设备安装，不启动、不测试、不读取日志，且不操作其他设备。

## R85-APP-QUOTA-EVENT-WINDOW 已完成（源码子阶段）

- [x] `parseUsageEvents()` 先读取 `kind` 与 quota 字段证据，再在 quota 语义下使用安全自定义窗口归一化。
- [x] `kind=quota`、quota 字段证据可保留 `hour`、`rolling-7d` 等窗口；普通 turn/compaction 自定义窗口继续清空。
- [x] M5 parser 覆盖 quota kind、quota source 兼容、普通事件回退和恶意窗口拒绝。
- [x] 本轮定向执行 `check:r82`、`check:r83`、`check:r79`、`check:r30`，均退出码 0。
- [x] 本轮执行 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`，退出码 0；主链和 R12-R83 postcheck 均通过。
- [x] 本轮执行 SDK 23 `assembleHap --no-daemon --stacktrace`，退出码 0；HAP 大小 `14,388,394` bytes，SHA-256 为 `162BF1C175E62D47A72DF1838D35488ED7F253C7125E0A3E3DAA300D6C34E323`。
- [x] 本轮执行 `git diff --check`，无实际空白错误；仅有既有 LF/CRLF 转换提示。
- [x] 本轮未安装、启动或测试设备；解析语义收口不属于重大 App 功能更新。

## R85 后续现场门

- [ ] 真实 Provider 的 quota event 自定义窗口、跨重连刷新顺序和长会话 Usage event 明细。
- [ ] 指定设备 `5KLBB25A10203862` 的 Usage/Diagnostics 展示确认；如后续出现重大 App 功能更新，只允许安装到该设备，不启动、不测试、不读取日志，且不操作其他设备。

## R83 后续现场门

- [ ] 真实 Provider 并发刷新、ETag/限流退避和跨重连 quota snapshot 顺序。
- [ ] 指定设备 `5KLBB25A10203862` 的 Usage/Diagnostics 展示确认；如需安装只允许安装，不启动或测试，且不操作其他设备。

## R86-DAEMON-FLEET-VERSION-CONFIG 已完成的源码子阶段

- `AgentHomeDaemonInstanceSnapshot`、`AgentHomeDaemonRollingStep` 和 `AgentHomeDaemonStepExecutionResult` 贯穿 expected/target Bridge/config 版本；连接池从 daemon status/remote config 状态读取实际版本，页面 update 操作传递目标 Bridge 版本。
- coordinator 在 generation 增长且 health 为 healthy 后继续校验版本；Bridge/config 漂移分别返回 `daemon_version_mismatch` 与 `daemon_config_version_mismatch`，首错停止并保留 pending/excluded 结果。
- `entry/src/test/AgentHomeDaemonFleetCoordinator.test.ets` 覆盖 restart 版本匹配、Bridge 版本变化、update 目标版本、config drift 和全部目标排除。
- 本轮实际执行 Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`，退出码 0；`git diff --check` 无实际空白错误。
- SDK 23 HAP 最终源码构建退出码 0，`BUILD SUCCESSFUL in 37 s 336 ms`；产物大小 `14,397,504` bytes，SHA-256 `B219495A5DE9E07A4E3A090C0C7A1FF0B8FF0FACA922D47027A3DEF5233AB6E7`。普通沙箱曾阻断 Hvigor 日志写入，用户授权后已完成受控重建。
- 现场仍需 Windows/Linux/macOS 全局安装、自启/升级回滚、双 Bridge A → B → A、真实签名远程配置和连续 heartbeat/generation；第 14 项不关闭。

## R87-PROVIDER-RECORDED-SESSION 已完成的源码子阶段

- Codex App Server usage/compaction producer 现在优先使用响应中的 `occurredAt`、`completedAtMs`、`timestamp` 等权威时间；没有时间字段时才回退到 Bridge 当前时间。
- Codex `thread/compacted` 与 `item/completed(contextCompaction)` 无论先后到达都只生成一个事件，并合并 `reason`、前后 token 和完成时间；只有通知没有 item 时在 turn 完成边界补发兜底事件。
- 新增脱敏录制协议 fixture `tools/agent-bridge/scripts/provider-recorded-session-fixture.json`，覆盖 Codex/OpenCode/Gateway 多轮 usage、双 compaction 顺序、quota reset、四类 metadata 及 Provider usage 字段。
- 新增 `check-provider-recorded-session-smoke.js`：回放三类 adapter，验证 metadata scope/alternatives/usage、quota reset 后最新快照、compaction 去重、late old snapshot 不回退、UsageManager 重建和重复事件幂等。
- `check:r87` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`；本轮实际执行定向 `npm run check:r87` 与 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`，Node 语法、录制回放和 Bridge 全量回归均退出码 0；Docker runtime 仍按 opt-in 规则 skipped。
- 本阶段只修改 Node Bridge/fixture/test，没有生成或安装 HAP；真实 Provider 账号、真实 quota/账单、长会话断网重连和指定设备 Usage/Diagnostics 展示仍是第 22、34 项 FIELD 门。

## R88-WEB-SESSION-EXPERIENCE 已完成的源码子阶段

- Web capability gate 新增 `messageQueue`、`usageEvents`、`usageBudgets` 和 `metadataGeneration` 消费路径；缺少 feature advertisement 的旧 Bridge 只保留既有核心工作台。
- queue 列表只展示受限状态/attempt/failure 摘要，取消与失败重试按 queue id 防重复提交；Usage 按 actual/estimated 分组展示 token 分类、currency cost、Provider quota、budget warning、compaction 和最近事件明细，缺失数值保持 unavailable。
- Metadata 生成使用显式 request id，四类 kind 都先进入可编辑 preview；取消调用 `metadata.generate.cancel`，只把 `sessionTitle` 交给既有 `agent.update`，branch/commit/PR 不在 Web 层直接执行 Git 写操作。
- 体验刷新请求带 `hostProfileId + workspaceId + agentId + sessionId + providerId`，结果写入前校验连接代际和当前 scope，旧 host/session 结果被丢弃。
- 本轮实际执行 R88 定向 smoke、Web UI contract/live、multi-tab scope、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 和 `git diff --check`，均退出码 0；Docker runtime smoke 仍按 opt-in 规则 skipped。
- 本阶段只修改 Node/Web UI 文件，没有 ArkTS/HAP 或设备操作；真实 Provider、真实旧 Bridge、双标签现场、长 terminal/diff 流、HarmonyOS App 全量动作和真机展示仍需 FIELD，第 22、34、23B 不关闭。

## R89-PROVIDER-USAGE-CAPABILITY 已完成的源码子阶段

- `ProviderUsageService.anyAvailable()` 统一复用 `isAvailable(provider.id)`，同时识别 adapter-backed 与 HTTPS endpoint-only Provider；未配置、HTTP 或 URL 内嵌凭证的 Provider 仍不会开启全局 capability。
- `check-provider-usage-endpoint-smoke.js` 增加 endpoint-only 全局 capability 断言，保留 HTTPS、重定向、大小限制和 token 不进入公开结果的既有覆盖。
- 本轮实际执行 Provider usage endpoint/runtime capability 定向 smoke、Node 语法检查和 `git diff --check`，均退出码 0。
- 本阶段只修改 Node Bridge 与 smoke/文档，没有 ArkTS/HAP 或设备操作；真实 Provider 账号、quota/账单、长会话和真机 Usage/Diagnostics 展示仍待 FIELD，第 22、34 项继续保持“部分实现”。

## R90-VOICE-CAPABILITY-MATRIX 已完成的源码子阶段

- Bridge `serverInfo.features.voiceCapabilityMatrix=true` 明确新客户端可以独立信任 `voiceRemoteSpeechToText` 与 `voiceRemoteTextToSpeech`；旧 `features.voice` 汇总字段保持原样，不删除或收窄。
- `AgentBridgeServerFeatureFlags` 与 parser 增加可选矩阵标识，缺字段安全默认为 `false`；Agent Home 仅在矩阵标识存在时严格使用独立远程 STT/TTS 标志，旧 Bridge 才回退到 legacy aggregate，避免 STT-only Provider 错误显示 TTS。
- `AgentBridgeVoiceParser.test.ets`、protocol alignment smoke 已覆盖新字段和缺字段兼容；本轮 Voice manager/platform 定向 smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 与 `git diff --check` 均退出码 0。
- HAP `entry/build/default/outputs/default/entry-default-signed.hap` 大小 `14,397,118` bytes，SHA-256 `502005B65E3F15F024A30EC08FFE47FCF4655CAF45EC0B5EF03363249924C070`；本轮未安装、启动或测试设备。

## R90 后续现场门

- [ ] 真机 AudioKit 权限、耳机/蓝牙路由、来电抢占、前后台切换、弱网长录音和真实 STT/TTS Provider。
- [ ] 指定设备 `5KLBB25A10203862` 的 Voice UI 现场确认；如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R104-PROVIDER-USAGE-STALE-SNAPSHOT 已完成的源码子阶段

- `ProviderUsageService` 新增有上限、可配置 TTL 的内存快照缓存，key 严格包含 provider/host/session/agent/window scope；刷新失败时只在同 scope 返回最后一次成功快照，并标记 `stale` 与稳定 warning。
- stale fallback 保留只读 quota/plan/detail，但 `providerUsageQuotaEvents()` 拒绝过期结果，避免刷新失败重复写入 UsageManager；TTL 到期后返回原有结构化失败。
- Provider failureCategory 经过稳定格式校验，原始错误文本不进入 stale 结果；新增 freshness smoke 覆盖 host 隔离、错误分类和 TTL 过期，并接入 `check:r104`/Bridge `postcheck`。
- 本轮实际执行 `node --check`、`npm run check:r104`，均退出码 0；未修改 ArkTS/HAP，未安装、启动或测试设备。

## R104 后续现场门

- [ ] 真实 Provider endpoint/adapter 的断网恢复、过期快照刷新顺序、长会话 quota 与多币种账单。
- [ ] 指定设备 `5KLBB25A10203862` 的 Usage/Diagnostics 展示；如后续出现重大 App 功能更新，只允许安装到该设备，且仅安装、不启动、不测试、不读取日志。

## R105-FLEET-CANCELLATION 已完成的源码子阶段

- `AgentHomeDaemonStepExecutionResult` 增加可选 `failureCategory`，保留旧构造调用的默认空值。
- `AgentHomeDaemonFleetConnectionPool` 产生的 `cancelled` action 现在由 Agent Home 页面传入 coordinator；coordinator 将该步骤标记为 `cancelled`，保留后续目标为 `pending`，并继续遵循首错停止。
- executor 抛出异常时固定记录 `executor_error`；目标身份变化记录 `daemon_target_changed`，普通拒绝缺少分类时使用 `daemon_operation_failed`，避免失败原因为空。
- Hypium 测试覆盖取消结果状态、失败分类和后续 pending 目标；该测试已在 `List.test.ets` 注册的 Fleet suite 中编译。
- 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`（退出码 0）、Bridge 全量 `npm --prefix tools/agent-bridge run check`（退出码 0）和 `git diff --check`（退出码 0）。

## R105 后续现场门

- [ ] 真实 App host 切换、页面销毁和 App 重启时验证滚动任务以 interrupted 状态停止，并要求重新 preview，不自动继续。
- [ ] Windows/Linux/macOS daemon 的自启、升级/回滚、双 Bridge A → B → A 和跨 profile 凭证隔离。

## R106-FLEET-LIFECYCLE-INTERRUPTION 已完成的源码子阶段

- 新增 `AgentHomeDaemonFleetRunControl`，提供一次性 cancel/reason 语义；`NGFAgentHomePage` 在 page disappear 和 host switch 时取消当前 rolling run，再停止连接池。
- coordinator 在每个 executor 前检查 control，步骤完成后再次在循环边界阻断后续目标；结果保留 completed/pending，状态为 `interrupted`，并记录受控 reason。
- 最后一个目标完成后才收到生命周期取消时仍返回 `interrupted`，不会误报告 `completed`；旧调用未传 control 时保持原有行为。
- Hypium 测试已覆盖步骤间取消、reason 和 pending 保留；测试随现有 Fleet suite 编译。
- 本轮实际执行 SDK 23 `assembleHap --no-daemon --stacktrace`（退出码 0）和 `git diff --check`（退出码 0）。Bridge 源码未变，沿用 R105 已通过的全量 check 证据。

## R106 后续现场门

- [ ] 真实 App 页面销毁、host 切换和 App 重启验证 interrupted 状态不自动恢复，必须重新 preview。
- [ ] Windows/Linux/macOS daemon 自启、升级/回滚、双 Bridge A → B → A 和跨 profile 凭证隔离。

## R109-VOICE-PCM-BUFFER-CLEANUP 已完成的源码子阶段

- `VoicePlatformFacade.playAudioBase64()` 的 PCM/raw 分支使用 `try/finally` 包围 renderer `write()`/`drain()`，同时清零复制出的 `audioBuffer` 和原始 `decoded`，覆盖成功与异常路径。
- `check-voice-platform-contract-smoke.js` 截取 PCM/raw 分支，验证 `drain()`、两份缓冲清理和成功返回的相对顺序；不会被编码音频路径或前置参数校验中的 `fill(0)` 假阳性满足。
- 本轮实际执行 `npm run check:voice-platform`、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均通过；HAP 14,457,721 bytes，SHA-256 `86143C940328ACD75FE717FC7B4500E735C7271B18FA7E9E5A498E256CE4D490`。

## R109 后续现场门

- [ ] 真机 AudioKit 播放、权限撤销/恢复、耳机/蓝牙路由、来电抢占、前后台、弱网长录音和真实 STT/TTS Provider。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R110-DAEMON-FLEET-LIVE 已完成的源码子阶段

- 新增 `check-daemon-fleet-live-smoke.js`，启动两个独立临时 home/端口/token 的 supervisor Bridge，并通过真实 WebSocket `clientHello.hostProfileId` 读取 `daemon.instance.status`。
- Smoke 验证 A/B `instanceId` 隔离与重连稳定、`generation`/`workerGeneration`/health 快照、A → B → A 连接切换，以及 A/B 串行 supervisor restart 后的代际增长。
- Smoke 验证 daemon target guard 在 handler 前拒绝跨 host、旧 generation 和跨实例 expected id，分别返回 `host_profile_mismatch`、`daemon_generation_stale` 和 `daemon_instance_changed`。
- 新命令 `check:daemon-fleet-live` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`；本轮定向 smoke 和 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 均退出码 0。
- 证据文件：[agent-bridge-r110-daemon-fleet-live-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r110-daemon-fleet-live-progress.md)。
- 本阶段只修改 Node Bridge、smoke、package script 和文档；未构建/安装/启动/测试设备。

## R110 后续现场门

- [ ] Windows/Linux/macOS 全局安装、自启重启、升级/回滚、权限路径和真实双 Bridge rolling。
- [ ] HarmonyOS App 多 host Fleet 界面、滚动操作、旧 Bridge 和断线/恢复现场。

## R111-BROWSER-ACTION-TARGET-SNAPSHOT 已完成的源码子阶段

- Browser action 的 preview 与 confirmed 结果现在只返回受限 `target` 摘要：`workspaceId`、`agentId`、`hostId`、`instanceId`、`pageId` 和 `action`；不包含 URL、文件路径、脚本、凭证、连接 id 或 host 内部能力摘要。
- Bridge 在确认成功后以实际 dispatch host 回填 target，并将 host 提供的同名字段列入保留字段过滤，避免外部 host 覆盖权威目标摘要；preview/confirm 仍由原有完整 payload digest、host binding 和一次性 planId 保护。
- App 新增 `AgentBridgeBrowserActionTarget`，`AgentBridgeBrowserResult.target` 解析新字段；缺少 target 的旧 Bridge 使用已知安全顶层字段和 instance/page 快照回退，未知字段保持空值。
- Browser manager smoke 与 live smoke 覆盖 preview/confirmed target、host 重注册导致旧 plan 失效、payload 变化、上传 plan 单次消费和旧结果重复提交；本轮 `node --check`、manager smoke、live smoke 与 `git diff --check` 均退出码 0。
- 本阶段修改 Bridge/App 模型与 smoke/文档；未执行 HAP 构建，未安装、启动或测试设备。

## R111 后续现场门

- [ ] 真实受支持 Browser host、恶意页面/登录态隔离、真实上传下载、HarmonyOS App 全量动作和平台能力注册。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R135-BROWSER-ACTION-TARGET-STATE 已完成源码子阶段

- `BrowserAutomationManager.action()` 对敏感 action 建立只读 target-state capture；支持 `page.snapshot` 的 host 返回经公共 DTO 限制后的 snapshot，Bridge 只在内存中计算 `pageId + instanceId + snapshot` digest。
- plan 只保存请求 digest、host registration/capability binding、target-state mode/digest 和 warning，不保存 snapshot 正文；Confirm 重新 capture，digest 不一致返回 `browser_target_changed`，不会派发 action。
- platform/HarmonyOS host 没有 `page.snapshot`、snapshot 失败或返回非法结构时分别以 `browser_target_snapshot_required`、`browser_target_snapshot_failed` 或 `browser_target_snapshot_invalid` fail closed；legacy external/CDP/native/custom host 继续 preview/confirm 兼容并返回 `browser_target_snapshot_unavailable` warning。
- manager smoke 新增页面状态变化拒绝、platform 缺 snapshot capability 和 legacy warning；`check:r135` 已接入 `postcheck`，覆盖 Node syntax、manager smoke 和 Browser live smoke。
- 本轮实际执行 `npm --prefix tools/agent-bridge run check:r135`，退出码 0；`git diff --check` 退出码 0。未修改 ArkTS/HAP，未安装、启动或测试设备。

## R135 后续现场门

- [ ] 真实受支持 platform Browser host、页面导航/替换、恶意页面/登录态隔离、上传/下载和 HarmonyOS App 全量动作。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R126-BROWSER-APP-EVENT-SCOPE 已完成的源码子阶段

- `AgentBridgeBrowserResult` 保留可选 `eventKind` 和单个 host workspace scope；`AgentHomeBrowserEventScopeCoordinator` 对页面可见性、workspace、host、instance 和 page 选择执行 fail-closed 校验。
- Agent Home 的 `browser.updated` 事件在进入状态更新前经过统一 gate；workspace/host/session/fork/import 切换通过 `updateActiveWorkspaceId()` 清理 Browser 请求、列表、日志、下载、截图和 permission 快照，迟到结果不会覆盖新 scope。
- 新增 Browser App scope smoke 和 Hypium parser/coordinator 覆盖 host registered/unregistered、permission、stale page、workspace mismatch 与隐藏页面；`check:r126` 已接入 Bridge `postcheck`。
- 本轮 `npm --prefix tools/agent-bridge run check:r126`、Node syntax、package JSON 解析和 `git diff --check` 均通过；未执行 HAP 构建，未安装、启动或测试设备。

## R126 后续现场门

- [ ] 真实平台 Browser host、恶意页面/登录态隔离、上传/下载、弱网长流和 HarmonyOS App 全量 Browser 动作。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R133-APP-DOWNLOAD-URL-CREDENTIAL 已完成源码子阶段

- App 的三类 Bridge 下载（消息附件图片、workspace 预览图片、通用下载）只使用 server-issued 一次性 `downloadPath`，不再把 `activeBridgeCredential` 作为 URL 查询参数发送。
- Bridge 仍通过 `/download/<token>` 调用 `consumeDownloadToken()`，旧下载路径协议保持兼容。
- 协议对齐 smoke 增加 App source 与 Bridge route 的精确断言，覆盖旧 credential 参数不会回归。
- 本轮 `node --check scripts/check-protocol-alignment-smoke.js`、`node scripts/check-protocol-alignment-smoke.js`、Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace` 均通过。首次 HAP 封装遇到一次性 `.hvigor` build-log `EBUSY`，未清理目录，重试成功。
- HAP `entry/build/default/outputs/default/entry-default-signed.hap` 大小 `14,522,413` bytes，SHA-256 `29837DC68661EBBE38F14CF917D36EF0BE405AC7A77908FEC458AED8DD2EC638`。
- 本轮没有安装、启动或测试设备；如产生 HAP，安装只允许针对 `5KLBB25A10203862`，且只安装不启动/测试。

## R133 后续现场门

- [ ] 真实 Browser/platform host 下载、恶意页面/登录态隔离、Web UI 下载流程和 HarmonyOS App 全量动作。
- [ ] 指定设备 `5KLBB25A10203862` 的现场安装（仅在需要时），不得操作其他设备。

## R134-APP-DOWNLOAD-PATH-VALIDATION 已完成源码子阶段

- `NGFAgentHomePage.ets` 在 URL 构造前限制 Bridge download path 为 `/download/` 下的单一 token 段，拒绝外部 scheme、额外路径、query/fragment、反斜杠、百分号编码和控制字符。
- 非法路径在创建 HTTP request 前以 `download path is invalid` fail closed；有效旧 token 字符仍兼容，服务端 `/download/<token>` 协议未改变。
- `check-protocol-alignment-smoke.js` 同时守护 R133 credential 边界、R134 路径校验和 Bridge `consumeDownloadToken()` 路由。
- 本轮定向 smoke 与目标文件 `git diff --check` 已通过；SDK 23 HAP 与 Bridge 全量 check 随后执行。

## R134 后续现场门

- [ ] 真实 Browser/platform host 下载、恶意页面/登录态隔离、Web UI 下载流程和 HarmonyOS App 全量动作。
- [ ] 指定设备 `5KLBB25A10203862` 的现场安装（仅在需要时），不得操作其他设备。

## R137-WEB-BROWSER-HOST-CAPABILITY 已完成的源码子阶段

- Web compatibility 新增强类型 Browser host DTO/list parser 和统一 `browserHostGate`；`browser.host.list` 同时兼容对象与旧数组响应，缺字段使用安全 legacy 默认值。
- 平台 host 必须同时满足 `browserHostCapabilityMetadata`、`browserPlatformHost`、`connected=true` 和 `readiness=ready` 才能在 Web 端执行命令或 action；缺能力、断开或未就绪只保留诊断摘要，不显示可执行入口。
- 旧 external/CDP/native/custom host 缺 readiness/connected 字段时保持兼容；显式 degraded/unavailable 仍阻断。
- `src/web/app.js` 的 Browser refresh、host 卡、命令和 action 控件均消费同一 parser/gate；新增 `check-web-browser-host-capability-smoke.js` 并接入 `check:r137`/`postcheck`。
- 本轮实际执行 `npm --prefix tools/agent-bridge run check:r137`，退出码 0，输出 `web browser host capability smoke ok`；Node syntax 检查通过。未修改 ArkTS/HAP，未安装、启动或测试设备。
- 证据文件：[agent-bridge-r137-web-browser-host-capability-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r137-web-browser-host-capability-progress.md)。

## R137 后续现场门

- [ ] 真实受支持 platform Browser host、HarmonyOS App 全量动作、恶意页面/登录态、上传下载和长流现场。
- [ ] 指定设备 `5KLBB25A10203862` 如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R141-WEB-COMPOSER-MENTION 已完成的源码子阶段

- `tools/agent-bridge/src/web/compatibility.js` 增加 composer token kind/parser，未知 kind 降级为 `text`，列表限制为 100 项；`app.js` 只从当前 host/workspace scope 提供 workspace、agent 和已加载文件候选，文件路径经过相对路径安全校验。
- Web composer 注册输入、ArrowUp/ArrowDown、Enter/Tab、Escape 和失焦关闭；用户选择候选后才生成可信 token，普通文本中的 `@` 不会自动提升为 token。workspace/agent 切换、归档、断线和重新登录会清除旧 token。
- Web 发送优先调用 `message.send`，携带 `clientMessageId`、`queuePolicy=queue` 和 `composerTokensJson`；旧 Bridge 对未知 RPC 回退到 `agent.send`。Bridge 旧 `agent.send` handler 也统一调用 `sanitizeComposerTokens`，保持 host/workspace/path 校验。
- 新增 `scripts/check-web-composer-smoke.js`，覆盖 parser 边界、HTML 控件、键盘路径、payload、路径安全、旧 handler 校验和 `innerHTML`/`eval` 禁止项；`check:r141` 已加入 `tools/agent-bridge/package.json` 的 `postcheck`。
- 本轮实际执行 Web composer smoke、`check:r141`、`check:r13`、`check:r88`、`check:browser`、`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check` 和 `git diff --check`，均通过；Docker runtime smoke 按 opt-in 规则 skipped。
- 本阶段只修改/补充 Node/Web 源码、smoke、package script 和文档，没有 ArkTS/HAP、设备安装或设备测试。证据文件：[agent-bridge-r141-web-composer-mention-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r141-web-composer-mention-progress.md)。

## R141 后续现场门

- [ ] 真实旧 Bridge、多标签切换、断线重连、长消息流和真实 Provider 发送现场。
- [ ] HarmonyOS App composer 全量动作和指定设备 `5KLBB25A10203862` 展示；如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R150-VOICE-RETENTION-STATUS 已完成的源码子阶段

- `VoiceManager` 新增受控 `sttRetentionPolicy` / `ttsRetentionPolicy` 与启动期环境覆盖；仅允许 `not_retained`、`ephemeral`、`retained`，缺失、非法或未知值安全归一化为 `unknown`。
- `voice.status.privacy` 按 STT/TTS 链路公开 `dataForwarded`、策略、受限来源、可选时长、整体状态和 `userNoticeRequired`；endpoint、token、原始环境变量、音频和 transcript 不进入公共 DTO。未知远程策略返回稳定 warning，不默认假定不保留。
- `serverInfo.features.voicePrivacyStatus=true`、App 强类型 parser、可信 Bridge 的主动 status 请求、host 切换清理和中英文风险提示均已接线；旧 Bridge 缺字段保持既有 Voice UI 安全降级。
- 本轮实际执行 `npm run check:r150`、`check:r130`、`check:r121`、`check:voice-platform`、`check:r13`、protocol alignment smoke、`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 与 `git diff --check`，均通过。HAP 为 `entry-default-signed.hap`，大小 `14,526,254` bytes，SHA-256 `B6D75A5C7F27544FE39968A54403BAB4A160F913C39328C9522E71DFF9AE68D8`。
- 证据文件：[agent-bridge-r150-voice-retention-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r150-voice-retention-progress.md)。第 21、33 项仍保持“部分实现”；真实 STT/TTS Provider 保留实践、真机权限/路由、耳机/蓝牙、来电、弱网与长录音仍为 FIELD 门。

## R150 后续现场门

- [ ] 使用真实远程 STT/TTS Provider 验证声明的 retention、数据地域、删除策略和变更通知；不得将 Bridge operator 配置视为 Provider 行为的审计证据。
- [ ] 在指定设备 `5KLBB25A10203862` 完成 Voice 权限、路由、蓝牙/耳机、来电、前后台、弱网和长会话验收；如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。

## R152-WEB-BROWSER-FULL-PAGE-SCREENSHOT 已完成的源码子阶段

- Web Browser 控制面新增整页截图 checkbox，默认关闭；只有用户显式选择时才发送 `fullPage=true`。
- `showBrowserScreenshot()` 继续复用既有 host/page payload、connection generation 与 request scope，截图响应继续经过兼容 parser 和受限 `data:` URL renderer。
- `check-web-browser-screenshot-smoke.js` 新增 `fullPage=true`、UI 控件、payload 和禁止硬编码 `false` 的断言；`check:r152` 已加入 `postcheck`。
- 本轮已实际通过 `check:r152`、`check:r116`、`check:r13`、`check:r88`、`check:browser` 和带 `system-conpty` 的 Bridge 全量 `npm run check`；全量退出码为 0，Docker runtime 按 opt-in 规则跳过。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。
- 证据文件：[agent-bridge-r152-web-browser-full-page-screenshot-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r152-web-browser-full-page-screenshot-progress.md)。

## R152 后续现场门

- [ ] 真实受支持 platform Browser host、CDP/Chromium 整页截图、恶意页面/登录态、上传下载、多标签和长流现场。
- [ ] HarmonyOS 真机能力仍按独立现场轨道验收；如需安装只允许目标 `5KLBB25A10203862`，不得启动、测试、读取日志或操作其他设备。

## R153-VOICE-TTS-SINGLE-PLAYBACK 已完成的源码子阶段

- Bridge 的兼容协议会通过 `voice.tts.updated` 事件和 `voice.tts.speak` RPC response 交付同一音频；App 现在按 `clientRequestId -> ttsRequestId -> envelope request id` 解析稳定 delivery identity。
- `AgentHomeVoicePlaybackCoordinator` 在同一 generation、hostProfileId 和 connectionEpoch 中只消费首次非空 identity；去重发生在 Voice 状态写入和媒体播放调用之前。
- 事件与 response 两条兼容路径均保留；begin/reset/invalidate/complete 会清理身份，新一轮 generation 可正常播放。
- Hypium 测试和 `check-voice-tts-single-playback-smoke.js` 覆盖空身份、错误 scope、双交付和新 generation；`check:r153` 已加入 `postcheck`。
- 本轮实际执行 R153/R121/R130/Voice platform/event scope/protocol 定向 smoke、带 `system-conpty` 的 Bridge 全量 `npm run check`、SDK 23 `assembleHap --no-daemon --stacktrace` 和 `git diff --check`，均退出码 0。HAP 大小 `14,542,721` bytes，SHA-256 `4E04B5F61A58D9777A558B0334A74479EACB2715393622AA430E22FD94E4D29E`。
- 证据文件：[agent-bridge-r153-voice-tts-single-playback-progress.md](/F:/DevEcoStudioProject/Coder/docs/agent-bridge-r153-voice-tts-single-playback-progress.md)。第 21、33 项仍保持“部分实现”。

## R153 后续现场门

- [ ] R155 收口压缩音频 AVPlayer 的 listener 注册顺序、initialized gate、异步换代和 DataSource 会话隔离。
- [ ] 在真实 Provider 和指定设备 `5KLBB25A10203862` 验证单次播放及 Voice 现场矩阵；如需安装只允许安装，不启动、不测试、不读取日志，且不操作其他设备。
