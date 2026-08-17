# Agent Bridge R57 Daemon Remote Config Host Scope

## 状态

已完成源码子阶段；跨平台 daemon、真实签名配置服务和双 Bridge rolling 仍属于第 14 项 FIELD 门。

## 本轮实现

- `daemonConfigPayloadForConnection()` 将当前 WebSocket `clientHello.hostProfileId` 作为 daemon config RPC 的权威 host scope，覆盖请求体中的伪造值；旧客户端没有 host 标识时继续使用兼容路径。
- `DaemonRemoteConfigManager` 的 apply/rollback plan 保存 `hostProfileId`，并在 confirm 时拒绝跨 host 重放；结果保留 host scope，便于 App 按 hostProfileId 合并状态。
- apply plan 同时绑定 instanceId、generation、source URL、configVersion 和 digest；fetched 文档或来源变化后旧 plan 返回 `plan_expired`。
- 新增真实 Bridge 子进程双 WebSocket smoke：覆盖 status scope、A 生成 preview、B confirm 返回 `host_scope_mismatch`、A confirm 成功、签名配置版本/来源变化使旧 plan 失效，以及 rollback 的跨 host 隔离。

## 验证证据

本轮实际执行并通过：

```text
node --check src/daemon-remote-config-manager.js
node --check src/server.js
node --check scripts/check-daemon-remote-config-smoke.js
node --check scripts/check-daemon-remote-config-host-scope-live-smoke.js
node scripts/check-daemon-remote-config-smoke.js
node scripts/check-daemon-remote-config-host-scope-live-smoke.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
```

`check:daemon-remote-config-host-scope-live` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`；本轮实际执行 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`，主 check 与 postcheck 均退出码 0。

随后执行 `git diff --check`，仅有既有 LF/CRLF 转换提示，没有 whitespace error。

本轮只修改 Node Bridge、smoke、package script 和文档，没有 ArkTS/HAP 改动，因此未构建、未安装、未启动或测试设备。若后续阶段产生重大 HAP 更新，安装目标仍仅允许 `5KLBB25A10203862`，且只执行安装。

## 后续现场门

- Windows/Linux/macOS 全局安装、自启重启、真实签名远程配置和双 Bridge rolling restart/update/rollback。
- 真实 App 多 host Fleet 操作、generation/heartbeat 连续变化和 host 切换。
