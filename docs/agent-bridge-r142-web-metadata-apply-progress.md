# R142 Web metadata apply 与 Git commit plan

日期：2026-08-10

## 范围

本阶段收口第 22、34 的 metadata 建议应用路径，以及第 23B Web Session Experience 的写操作消费；不宣称真实 Provider、真机或现场浏览器验收完成。

## 已完成

- `WorkspaceService` 新增兼容的 commit plan gate。只有请求显式携带 `preview`、`requireConfirm`、`confirm` 或 `planId` 时进入既有 `WorkspaceGitPlanManager`；未携带这些字段的旧客户端继续使用原有直接 commit 行为。
- commit preview 校验非空消息和当前 index 的 staged paths；没有 staged changes 时返回 `git_nothing_to_commit`。plan 绑定 workspace、repository snapshot、message digest 和当前 Git generation/fingerprint，重复或状态变化的 confirm 会失效。
- Web metadata apply 增加 in-flight guard 和状态反馈。四种 kind 分别使用：
  - `sessionTitle` -> `agent.update`；
  - `branchName` -> `workspace.git.branch` create 的 preview/confirm；
  - `commitMessage` -> `workspace.git.commit` 的显式 preview/confirm；
  - `pullRequest` -> `github.pr.create` dry-run 后确认，再创建 PR。
- Web 编辑后的 textarea 内容作为最终建议；成功后刷新对应 Session、Git 或 GitHub scope，旧 capability/Bridge 缺失时不绕过既有 RPC。
- 新增 `check-web-metadata-apply-smoke.js`，并将 `check:r142` 接入 Bridge `postcheck`；workspace Git plan smoke 增加 commit preview、confirm、无写入 preview 和重复 plan 失效断言。

## 本次验证

- `node --check src/workspace-service.js`：通过。
- `node --check src/web/app.js`：通过。
- `node scripts/check-web-metadata-apply-smoke.js`：通过。
- `npm run check:r142`：通过。
- `npm run check:r88`：通过（含 Web session live smoke）。
- `node scripts/check-workspace-git-plan-smoke.js`：通过。
- `node scripts/check-workspace-git-smoke.js`：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：通过；Docker runtime 仍按 opt-in 规则 skipped。
- `git diff --check`：通过。

本阶段仅修改 Node/Web/Smoke/文档，未修改 ArkTS/HAP，未构建、安装、启动或测试设备。若后续产生重大 HAP，只允许安装到 `5KLBB25A10203862`，且仅安装不启动、不测试、不读取日志。

## 仍待现场验收

- 真实 Provider 的四类 metadata 质量、真实 GitHub 账号/权限和远程 PR 创建。
- 真实旧 Bridge、Web 多标签、长消息流和浏览器现场。
- HarmonyOS App 的全量 metadata/Git/diagnostics 展示，以及真机键盘/窗口行为。
