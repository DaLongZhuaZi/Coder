# R160 App GitHub 登出入口

日期：2026-08-15
状态：已完成（第 9 项 GitHub 集成的 App 端 OAuth 登出源码缺口补齐；第 9 项保持已实现）

## 目标

协议对称性审计发现：App 端 `isBridgeGitHubResult` 能解析 `github.auth.logout` 结果（Bridge 有 `GITHUB_AUTH_LOGOUT` RPC），但 App client 没有 logout 方法、页面没有登出入口——OAuth 生命周期在 App 端缺少主动撤销授权的能力。

## 已实现

- `AgentBridgeClient.ets`：新增 `logoutGitHub(accountId)`，发送 `github.auth.logout` RPC（与 `requestGitHubAuthStatus` 同 payload 模式）。
- `NGFAgentHomePage.ets`：GitHub PR 区新增 `agent_home_github_sign_out` 按钮（仅在 `githubAccountId.length > 0` 时启用）；`signOutGitHub()` 调用 client 后清理全部本地 GitHub 状态（accountId、watch、owner/repo/reviewer/label/attachment/PR/head/base/title/body 草稿、lastGitHubResult），并给出登出反馈。
- i18n：`agent_home_github_sign_out`（zh “登出” / en “Sign out”）写入 base/zh_CN/en_US 三份资源。
- `AgentBridgeM7Parser.test.ets`：新增 `parsesGitHubAuthLogoutResultAndAccount`（action 识别 + account id/login 解析）。

## 自动化证据

- SDK 23 `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；`entry/build/default/outputs/default/entry-default-signed.hap` 于 2026-08-15 13:00:57 生成，大小 `14,547,897` bytes，SHA-256 `9479614D06ECEE66392D91736A22DF3E5174B9F9A84CD2EFB5D1F8AB0DB05A30`。仅保留既有 syscap、弃用 API 和异常处理警告。
- 三份 i18n JSON 以 UTF-8 显式解析通过；`git diff --check` 退出码 0。
- Hypium 测试注册到既有 `AgentBridgeM7Parser.test.ets`（测试执行需要设备，不在本机运行，编译由 SDK 23 HAP 构建的 ArkTS 编译覆盖）。

## 未关闭的门

- 真实 GitHub 账号 OAuth 登出后的 token 撤销、多账号、限流和现场多 Bridge 行为仍由第 9 项 FIELD 验收。
- 本轮未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。
