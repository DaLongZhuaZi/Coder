# R110 Daemon Fleet 双 Bridge Live Smoke 进度

更新时间：2026-08-10

## 本轮目标

补齐第 14 项 Daemon Fleet 的可自动化跨实例证据，不把单 Bridge supervisor smoke 或 App 纯逻辑 coordinator 测试当作双 Bridge 运行时证明。

## 已完成

- 新增 `tools/agent-bridge/scripts/check-daemon-fleet-live-smoke.js`。
- Smoke 启动两个独立的 `supervisor-entrypoint.js` 进程，使用独立临时 `AGENT_BRIDGE_HOME`、端口和 token；结束时关闭 supervisor、worker 和临时目录。
- 通过真实 WebSocket `clientHello.hostProfileId` 连接 A/B，调用 `daemon.instance.status` 验证：
  - A/B 的 `instanceId` 不相同；
  - 同一 Bridge 重连前后 `instanceId` 稳定；
  - `generation`、`workerGeneration`、`instanceHealth` 为有效快照；
  - host profile scope 只对应当前连接。
- 通过真实 supervisor restart 验证 A、B 的 worker 替换后 generation 单调增长，Bridge 实例身份保持不变。
- 验证 A → B → A 的连接切换：A 重启后重新连接，B 独立重启，再重新读取 A；两者的 instance/generation 不串线。
- 验证 target guard：跨 host 返回 `host_profile_mismatch`，旧 generation 返回 `daemon_generation_stale`，跨实例 expected id 返回 `daemon_instance_changed`，均在 restart 执行前阻断。
- 新命令 `check:daemon-fleet-live` 已加入 `tools/agent-bridge/package.json` 的 `postcheck`。

## 本轮实测命令

- `npm run check:daemon-fleet-live`：退出码 0，输出 `daemon fleet live smoke ok`。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`：退出码 0；包含新 fleet smoke、daemon remote-config host scope、Browser/Web、Voice、Provider、MCP/CLI 和既有 postcheck。
- 未执行 SDK 构建、HAP 安装、启动、日志读取或设备测试；没有操作 `5KLBB25A10203862` 之外的设备。

## 仍需现场验收

- Windows/Linux/macOS 全局安装、自启重启、升级/回滚及权限路径。
- 真实跨平台双 Bridge rolling restart/update/rollback、网络断线和凭证隔离。
- HarmonyOS App 多 host 的真实界面、滚动操作和旧 Bridge 现场行为。

