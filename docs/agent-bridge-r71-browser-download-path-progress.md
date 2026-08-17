# R71 Browser 下载路径公开面脱敏进度

更新时间：2026-08-09

## 范围

本阶段收口清单第 16、23D 的 Browser Automation 下载路径公开边界。核查发现 R69 已对嵌套 permission DTO 脱敏，但 `browser.permission.get` 顶层兼容字段仍返回工作区绝对 `downloadDirectory`，Chromium CDP download action 和 `download.list` 结果也可能回显 Bridge 内部绝对下载目录/文件路径。本阶段只修正公开结果，不改变 Bridge 内部为 Browser host 配置受管下载目录的能力，也不宣称已具备 HarmonyOS/平台 Browser host 或真实浏览器现场能力。

## 任务进度

| 任务 | 状态 | 证据 |
|---|---|---|
| 公开 permission 结果脱敏 | 已完成 | `permissionGet()` 顶层兼容字段固定为 `.agent-bridge-downloads`；嵌套 `permission` DTO 继续不含路径 |
| CDP download/action/list 结果脱敏 | 已完成 | `BrowserCdpHost` 的 action 与 `download.list` 只返回受控相对标识/文件元数据；Bridge `sanitizeDownloadHostResult()` 与 `sanitizeDownloadListHostResult()` 清理外部 host 的绝对路径字段 |
| 兼容回归与安全断言 | 已完成 | manager、CDP、live、protocol smoke 均增加路径不泄露和内部命令仍使用绝对目录的断言并通过 |
| 文档与清单收口 | 已完成 | R71、continuation、architecture 与 alignment 已记录本轮实现边界和实际命令结果 |

## 设计决策

- Bridge 内部 `commandPayload.downloadDirectory` 继续使用受管 workspace 子目录的绝对路径，供 CDP `Browser.setDownloadBehavior` 使用。
- RPC 和 host result 不再返回绝对路径；兼容字段 `downloadDirectory` 改为固定相对标识 `.agent-bridge-downloads`，下载列表移除 `filePath/path/downloadPath` 等本地路径字段，旧客户端仍可通过非空字段判断“已配置”，但不会得到本机目录结构。
- 新 App 继续只消费 `downloadDirectoryConfigured`；公开状态不增加路径字段。
- 不把下载文件名、页面正文、凭证或 host 内部连接信息写入 permission/download 结果、审计或诊断。

## 验证边界

- 自动化验证公开 permission、preview/confirm、CDP download action/list 结果均不含工作区绝对路径，同时确认发往 Browser host 的内部命令仍带正确绝对目录。
- 本阶段不执行真机安装；Node Bridge 源码无 HAP 变更。平台 host、真实上传/下载、恶意页面、登录态隔离和 HarmonyOS App 全量动作继续属于 FIELD。

## 本次验证

- `node --check src/browser-automation-manager.js; node --check src/browser-cdp-host.js; node --check scripts/check-browser-automation-manager-smoke.js; node --check scripts/check-browser-cdp-host-smoke.js; node --check scripts/check-protocol-alignment-smoke.js`：通过。
- `node scripts/check-browser-automation-manager-smoke.js`：通过，包含 permission 顶层兼容字段、内部绝对下载目录、download action 和 download list 外部 host result 清理断言。
- `node scripts/check-browser-cdp-host-smoke.js`：通过，CDP download action/list result 不含绝对目录或文件路径。
- `node scripts/check-browser-automation-live-smoke.js`：通过，真实 Bridge RPC permission get 不返回工作区绝对路径。
- `node scripts/check-protocol-alignment-smoke.js`：通过，协议对齐断言覆盖公开路径脱敏 helper 和受控 marker。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`（工作目录 `tools/agent-bridge`）：退出码 0，包含本阶段 Browser 回归及现有全量 Node/CLI/MCP/Web/Provider/Daemon/Voice/Usage postcheck。
- `git diff --check`：退出码 0；仅输出仓库既有 LF/CRLF 转换提示。
