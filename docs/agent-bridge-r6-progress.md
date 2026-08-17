# Agent Bridge R6 Web UI 进度

## 目标

依据对齐清单第 23B 项，持续把静态 Web 控制端收口为复用 Bridge RPC 的 workspace、chat、terminal、Git/Diff、notification、settings/doctor 工作台；不建立平行后端，也不把基础 contract smoke 当成完整现场能力。

## 本轮源码完成

- [x] `/web/auth/session` 在 bearer 首次验证后签发 host/origin 绑定的 HttpOnly、SameSite=Strict Web session cookie；页面刷新可用 cookie 重新换取一次性 WebSocket ticket；新增 `/web/auth/logout` 清理 cookie。
- [x] Web UI 使用 `workspace.registry.list/create` 展示真实 workspace registry，选择 workspace 后再筛选 Agent，不再从 Agent cwd 生成伪工作区。
- [x] Agent attach 后显式调用 `session.messages` 恢复聊天内容，事件刷新按 session、workspace、terminal、notification 和 browser 范围收敛，不再每个 delta 都全量 `refreshAll()`。
- [x] Terminal UI 使用 `terminalBinaryFrames`/`terminalActivity` capability gate，提供 list、bounded capture、create 和 close；缺少能力时隐藏区域。
- [x] Web Terminal 在 `terminalBinaryFrames` 可用时使用同一 WebSocket 的 V2 `terminal.subscribe`/`terminal.unsubscribe`、`RESTORE`/`SNAPSHOT`/`OUTPUT` binary frame，并提供 input、resize、恢复按钮、输出 512 KiB 限制和 `bufferedAmount` 背压提示；旧 Bridge 继续使用 bounded capture fallback。
- [x] Git/Diff 使用结构化 `workspace.changes.get`、`workspace.diff.get`，展示文件状态/增删摘要，支持单文件行/文件 cursor 的继续加载和截断结果。
- [x] Git/Diff Web 增加 summary/files/unified 三种视图；复用同一 changes/diff source，按当前文件和分页游标做内存缓存，切换视图不重复拉取未变化内容。
- [x] Web Git 增加 stage/unstage、commit、pull、push、branch、stash、merge 和 discard；discard/pull、branch delete、stash pop/drop、merge 使用 Bridge 返回的同一 `planId` preview/confirm 门禁，成功后只刷新当前 workspace Git/files scope。
- [x] Web UI 使用 `workspace.files.list`、`workspace.file.get` 和 `workspace.file.download` 提供 workspace-scoped 文件浏览、受限文本预览和一次性同源下载 URL 校验；`workspaceFiles` capability 缺失时隐藏区域。
- [x] Notification 支持 unread/read、受控 route/action；Diagnostics 通过 `daemon.status`、`daemon.health`、`workspace.registry.doctor` 和 `diagnostics.export` 生成八组强类型状态，保留脱敏 remediation/actionId，并提供 JSON/text 浏览器文件导出。
- [x] 缺少新诊断 RPC、字段或 capability 时，Web 使用 optional request、兼容状态和 daemon/doctor fallback，不阻断现有聊天、workspace、terminal 和 Git 能力；旧 Bridge 现场仍需复验。
- [x] Web 标签通过不共享凭证的 `BroadcastChannel` 同步 workspace/session 变更、刷新和注销；真实多标签浏览器行为仍待现场验证。
- [x] Web UI 保持 DOM 安全：只使用 `textContent`/DOM API，不使用 `innerHTML`、`eval`、`localStorage` 或把 token 写入 URL。
- [x] Web GitHub 工作台消费现有 OAuth Device Flow、account/binding、PR list/status/update、reviewer/label、merge、checks、watch 与 attachment preview/upload RPC；OAuth 仅展示 user code/HTTPS verification URL，写操作统一 preview/confirm，缺少 `githubAssetUpload` 时隐藏上传入口。

## 本次真实验证

执行日期：2026-08-08，工作区 `F:\DevEcoStudioProject\Coder`。

| 验证 | 结果 |
|---|---|
| `node --check src/server.js` | 通过 |
| `node --check src/web/app.js`、`node --check src/diagnostics.js` | 通过 |
| `node scripts/check-web-ui-contract-smoke.js` | `web UI contract smoke ok` |
| `node scripts/check-web-ui-live-smoke.js` | `web UI live smoke ok`，覆盖 HttpOnly cookie 恢复、Origin 校验、logout 清理、daemon status/health、workspace doctor 和八组 diagnostics export |
| `node scripts/check-web-github-smoke.js` | `web github smoke ok`，覆盖环境 token auth、workspace binding、PR 分页/状态/更新/reviewer/label/merge、checks、watch 生命周期和附件 capability 降级 |
| `node scripts/check-diagnostics-smoke.js` | `diagnostics smoke ok` |
| `npm run check` | 通过，退出码 0；本轮最终执行，包含 Web contract/live/GitHub smoke、diagnostics smoke、BroadcastChannel contract 与既有 Bridge 全量 smoke |

## 当前剩余门

第 23B 继续保持“部分实现”。本轮已完成 terminal binary subscribe/restore/output/input/resize/backpressure 的 Web 接线、workspace 文件浏览/受限预览/下载、Git stage/unstage/commit/pull/push/branch/stash/merge/discard 操作和高风险 plan gate，Git/Diff summary/files/unified 三模式与当前文件分页缓存，settings/doctor 八组状态、兼容降级、受控 remediation 和 JSON/text 导出，以及 GitHub OAuth/account/binding/PR/checks/watch/attachment 工作台。尚未完成真实多标签、旧 Bridge、长终端流和浏览器现场；这些现场门仍不能用本轮 smoke 替代。
