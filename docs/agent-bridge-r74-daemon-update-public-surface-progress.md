# R74 Daemon Update 公开状态边界进度

更新时间：2026-08-09

## 背景

R73 已收敛 daemon `status`、`health` 和 `logs` 的顶层配置/日志路径及 managed process 记录。复核发现这些响应中的 `update` 嵌套对象，以及独立 `daemon.update.status`，仍直接复制更新器保存的 `statePath`、`developmentRoot`、`stagedPath`、`backupPath` 和安装命令细节。

## 实施

- [server.js](F:/DevEcoStudioProject/Coder/tools/agent-bridge/src/server.js)
  - 新增 `publicDaemonUpdateStatus()`，由 daemon status/health 和 `daemon.update.status` 共用。
  - 对更新状态执行 allowlist 风格递归裁剪，移除 path/cwd/command/args/environment/token/password/credential/secret/private key 字段。
  - `statePath`、`stagedPath`、`backupPath` 和 development root 只返回稳定 `.agent-bridge/...` marker；内部更新器仍使用真实路径。
  - 保留版本、完整性、pending/replacement、失败分类和更新时间等 App 所需字段。
- [check-daemon-public-surface-smoke.js](F:/DevEcoStudioProject/Coder/tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js)
  - 预置带绝对路径、命令和参数的 update state。
  - 验证 daemon health/status 嵌套 update 与独立 `daemon.update.status` 均不泄露临时 Bridge home，并返回 marker。
- README、架构文档、持续进度和对齐清单已补充 R74 事实与证据索引。

## 验证

已通过：

```text
node --check tools/agent-bridge/src/server.js
node --check tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js
node tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js
node tools/agent-bridge/scripts/check-daemon-supervisor-live-smoke.js
```

随后实际执行 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`，主链及全部 postcheck 均退出码 0；`git diff --check` 退出码 0，仅有既有 LF/CRLF 转换提示。本阶段未修改 ArkTS/HAP，未安装、启动或测试设备。

## 现场边界

R74 不改变第 14 项跨平台 daemon 安装、自启/升级、双 Bridge rolling，也不改变第 16/23D 的真实 Browser host、HarmonyOS App 全量动作和恶意页面现场门。
