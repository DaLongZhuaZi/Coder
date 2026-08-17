# Agent Bridge R56 GitHub WebSocket Host Scope

## 状态

已完成源码子阶段；真实 GitHub 账号、组织权限、限流和资产服务仍属于 FIELD。

## 本轮实现

- 新增 `tools/agent-bridge/scripts/check-github-host-scope-live-smoke.js`。
- smoke 启动真实 Bridge 子进程，并建立两个真实 WebSocket `/ws` 连接；每条连接发送不同的 `clientHello.hostProfileId`。
- 通过真实 RPC 验证连接 Hello scope 覆盖伪造 payload：binding A/B 只能写入和读取自身 host。
- 通过本地 OAuth HTTP mock 验证 A 创建的 Device Flow session 不能由 B poll。
- 通过本地 GitHub API mock 验证 A 创建的 PR update plan 不能由 B confirm；该验证发现并修复 `github-client.js` 中 PR update/reviewer/label/merge plan 未保存 `hostProfileId` 的缺口。
- 验证 watch stop 的跨 host 阻断，以及连接关闭后 watch subscriber 清理；同 host 重连重新建立 watch 时 subscriberCount 保持 1。

## 验证证据

本轮实际执行并通过：

```text
node --check src/github-client.js
node scripts/check-github-host-scope-live-smoke.js
npm run check:github-host-scope-live
AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check
git diff --check
```

`npm run check` 退出码为 0，`postcheck` 实际执行了 `check:github-host-scope-live`。本轮只修改 Node Bridge、smoke、package script 和文档，没有 ArkTS/HAP 修改，因此未构建、未安装、未启动或测试设备。

## 后续现场门

- 真实 GitHub Device Flow、token 撤销、scope 不足、多账号切换和真实权限错误。
- 真实 WebSocket 多 Host App 页面离开/断线、限流退避、长 watch 和资产上传服务。
