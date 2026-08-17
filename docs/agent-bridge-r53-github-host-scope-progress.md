# R53 GitHub Host Scope 收口进度

更新时间：2026-08-09

## 目标

将同一 Bridge 上的 GitHub OAuth session、一次性 plan、附件上传 plan 和 PR watch 订阅绑定到连接声明的 `hostProfileId`，并确保连接断开时释放该连接创建的 watch，避免多 Host Profile 之间串线或遗留轮询。

## 已完成

- `server.js` 新增 `githubPayloadForConnection()`；有 host 的 WebSocket 连接以 `clientHello.hostProfileId` 覆盖请求 payload，统一作用于 OAuth、account/binding、PR、checks、watch、附件和 issue 兼容 RPC；没有 host 的旧连接继续保留原 payload 行为。
- OAuth device session 保存可选 `hostProfileId`，poll 使用安全读取并拒绝跨 host 继续授权；过期 session、旧 session 缺字段和旧客户端仍返回结构化结果。
- GitHub PR/reviewer/label/merge 与附件 upload plan 保存 host scope；消费时校验 action、仓库、目标编号、host 和过期/已消费状态，跨 host 或重复 confirm 不能消费 plan。
- watch key 包含 host；watcher 的 subscriber 保存内部 connection owner，`stopWatchersForConnection()` 在 WebSocket 注销时清理当前连接的订阅，最后一个订阅退出后停止 timer。CLI/HTTP 无 connection owner 时保持显式 stop 的兼容行为。
- 新增 `check-github-host-scope-smoke.js`，覆盖双 host binding、跨 host plan consume、OAuth poll scope、watch subscriber owner 清理和 server handler 接线；已接入 `postcheck` 的 `check:github-host-scope`。

## 本轮实际验证

- `node --check tools/agent-bridge/src/github-client.js`
- `node --check tools/agent-bridge/src/server.js`
- `node --check tools/agent-bridge/scripts/check-github-host-scope-smoke.js`
- `node tools/agent-bridge/scripts/check-github-host-scope-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；包含 R53 smoke 和既有 precheck/check/postcheck。
- `git diff --check`，退出码 0；仅报告既有 LF/CRLF 转换提示。

本轮只修改 Node Bridge、smoke 和文档，没有 ArkTS/HAP 变更，因此没有安装包操作。若后续产生重大 HAP，安装目标仍严格限定为 `5KLBB25A10203862`，只安装，不启动或测试。

## 现场门

- 真实 GitHub 多账号、多 workspace、token 撤销、限流和资产上传服务仍需现场验收。
- 多 Host 真 WebSocket 连接、页面离开/断线 watch 清理和跨设备 App 行为需要真实环境验证；源码 smoke 不替代现场证据。
