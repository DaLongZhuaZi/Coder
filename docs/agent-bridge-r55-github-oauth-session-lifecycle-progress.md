# R55 GitHub OAuth Session Lifecycle 收口进度

更新时间：2026-08-09

## 目标

保证 GitHub OAuth Device Flow 的 session 在过期、授权拒绝、access token 无效、账号查询失败或安全存储失败后及时清理；`authorization_pending`、`slow_down` 仍保留 session 并遵守下一次轮询时间，重复 poll 继续受并发门禁保护。

## 已完成

- 过期 `devicePoll` 在返回 `authorization_expired` 前删除内存 session；旧 session 缺少可选 host 字段仍安全读取。
- 终态 OAuth 错误 `access_denied`、`expired_token`、`invalid_grant`、`unauthorized_client` 和 `device_code_expired` 删除 session；`authorization_pending`/`slow_down` 保留并更新 interval/nextPollAt。
- access token 缺失、账号 `/user` 查询失败或 secure credential store 写入失败都会清理已消费的 device session，避免 device code 和轮询状态残留。
- R53 GitHub host scope smoke 扩展本地 OAuth mock，覆盖过期 session、`access_denied` 清理、host mismatch 和 watch owner 清理。

## 本轮实际验证

- `node --check tools/agent-bridge/src/github-client.js`
- `node --check tools/agent-bridge/scripts/check-github-host-scope-smoke.js`
- `node tools/agent-bridge/scripts/check-github-host-scope-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`，退出码 0；`postcheck` 实际执行 GitHub host scope、credential store 和既有全量 smoke。

本轮只修改 Node Bridge/smoke，没有 ArkTS/HAP 变更，不执行设备安装。重大 HAP 安装仍只允许目标 `5KLBB25A10203862`，且只安装、不启动或测试。

## 现场门

- 真实 GitHub Device Flow pending/slow_down/拒绝、token 撤销、scope 不足和多账号切换仍需现场验收。
