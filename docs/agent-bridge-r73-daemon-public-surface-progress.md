# R73 Daemon 公开状态边界进度

更新时间：2026-08-09

## 范围

本阶段收口 daemon `status`、`health` 和 `logs` RPC 的公开 DTO，防止本机 Bridge home、配置/日志绝对路径、managed process 命令行和工作目录进入远程 App、MCP、Web 或诊断调用方。内部 supervisor、日志读取和进程生命周期仍使用真实路径，不改变本地运行行为。

## 已完成

- `tools/agent-bridge/src/server.js`
  - `configPath` 固定为 `.agent-bridge/config.json` marker。
  - `logPath`/`path` 固定为 `.agent-bridge/logs/daemon.log` marker。
  - `managedProcesses` 通过独立 public DTO 输出，仅保留 id、providerId、kind、pid、alive、受控 owner 摘要、createdAt 和 updatedAt。
  - 公开 DTO 不再包含 command、args、cwd 或完整 identity。
  - 日志读取失败返回稳定 `daemon_log_read_failed` warning，不回显底层文件系统错误。
- `tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js`
  - 预置带绝对 command/args/cwd 的 ledger 记录。
  - 通过临时 Bridge 请求 `daemon.health`、`daemon.status` 和 `daemon.logs`，断言路径 marker、字段裁剪和私有路径不泄露。
- `tools/agent-bridge/package.json`
  - public-surface smoke 已接入全量 `check` 的主链。
- `docs/agent-bridge-architecture.md`、`tools/agent-bridge/README.md`
  - 记录公开 marker、managed process 受控 DTO 和验证命令。

## 验证

已执行：

```text
node --check tools/agent-bridge/src/server.js
node --check tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js
node tools/agent-bridge/scripts/check-daemon-public-surface-smoke.js
```

以上命令退出码均为 0。随后实际执行 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`，主检查与全部 postcheck 均退出码 0；`git diff --check` 退出码 0，仅有既有 LF/CRLF 转换提示。本阶段未修改 ArkTS/HAP，未安装、启动或测试设备。

## 剩余现场门

R73 只处理源码公开 DTO 边界，不改变第 14、16、23D 的现场状态。Windows/Linux/macOS daemon 安装、自启/升级、真实 Browser host、HarmonyOS App 全量动作、恶意页面和长流仍按主对齐清单的 FIELD 轨道验收。
