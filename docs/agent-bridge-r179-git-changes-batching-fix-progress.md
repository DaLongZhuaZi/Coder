# R179：workspace.changes.get 未跟踪文件逐个 git 子进程缺陷修复（stall 根因）

日期：2026-08-16
状态：已实测（修复后 4.1s vs 修复前 >90s 超时；全量回归 EXIT=0）

## 1. 缺陷发现（间歇事件循环 stall 的根因之一）

Web UI Git/Diff 面板现场验证时发现 `workspace.changes.get` RPC 超时 90s+；期间 Bridge health 间歇 12-15s 超时、WS 握手超时——即多轮观察到的 stall 现象。

根因（`tools/agent-bridge/src/workspace-service.js` getChanges）：对 **每个 untracked 条目** 单独执行 `git ls-files --others --exclude-standard <path>`（listUntrackedFilesForPath）。当前工作区有 ~380 个 untracked 条目（含 oh_modules 等大目录），每次请求顺序派生 380+ 个 git 子进程（每个 ~100ms+），单次请求耗时 60-90s+；Web UI 多标签每 15s 刷新都会触发，服务被 git 子进程海量占满 → 事件循环被 async 子进程饱和、health 超时。

## 2. 修复（workspace-service.js，备份 .bak-r179）

- 新增 `buildUntrackedFileMap(rootPath, untrackedEntries)`：**一次** `git ls-files --others --exclude-standard -z` 枚举全部未跟踪文件，按条目路径前缀分组（含 resolveInside 单文件兜底），返回 Map。
- `getChanges`：先对 untracked 条目构建一次索引，循环内直接查 Map——**380+ 次 git 子进程降为 1 次**；行为等价（同一 ls-files 语义、前缀分组与原逐路径结果一致）。

## 3. 现场验证

- 修复前：`workspace.changes.get` >90s 超时（RPC 层）；health 间歇超时。
- 修复后：**4.1s 返回**（branch=main、444 changes、diffSummary 完整）；Web UI Git 摘要实时渲染 `main · 445 changed` + 变更列表（modified +1/-1、deleted、Diff/Stage/Discard 操作区）；Bridge health 稳定。

## 4. 回归

- Bridge 全量 `npm run check`（含 diff pagination/workspace/web git 相关 smoke）退出码 0（另行记录）。

## 4b. 追加修复（R179b：稳定性闭环）

- **changes.get 缓存**（workspace-service.js）：按 rootPath 缓存计算结果（TTL 4s），响应时按请求方 sessionId 重映射 change/commit id——多标签 15s 刷新风暴收敛为每 TTL 一次计算；git 写操作（stage/unstage/discard/commit/pull/push/branch/stash/merge）主动清缓存。实测：连续调用 108ms/133ms（此前 705ms-4s-90s）。
- **missing-session discovery 冷却**（provider-registry.js）：30s → **5 分钟**——确认缺失的会话不再每 30s 触发一次全 provider discovery（codex exec 15-30s）。
- **codex 会话目录缓存**（codex-app-server-provider.js）：`CODEX_THREAD_LIST_CACHE_MS` 2s → **30s**——重复 discovery 变为缓存命中。
- **稳定性验证**：80s 连续监控 **0 次 health 失败**（此前每 ~60s 出现 6-30s 失败窗口）；git 进程峰值 0-16（此前 20-39 持续）。

## 5. 附注

- codex exec 第三方 discovery 慢（15-30s）仍是独立环境限制（R168 冷却已缓解触发频率），FIELD。
- 本轮未修改 ArkTS/HAP，无需 SDK 23 构建。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling、codex exec discovery 性能。