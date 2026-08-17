# Agent Bridge R129 Browser host registration generation progress

更新时间：2026-08-10

## 目标

防止同一 Browser host connection 使用相同 `hostId` 重注册后，旧 capability 下发的普通 command 继续接受结果。R128 只要求平台 `page.action` 显式声明动作能力；R129 将同一生命周期保护扩展到所有 Browser command 的在途请求。

## 实现

- 每次成功 host 注册在 Bridge 内部生成递增 `registrationGeneration`，不新增或要求 App 公共字段。
- 同连接同 `hostId` 重注册前，旧 pending command 统一以 `browser_host_reconfigured` 结束；失败注册不会破坏当前 host 或 pending command。
- dispatch 将 host generation 写入 pending 状态；结果处理再次比较当前 host generation，缺失或变化时 fail closed。
- `page.action` plan 的 `hostBinding` digest 同时包含 registration generation，因此重注册会使旧 preview/confirm plan 失效。
- 旧结果在 pending 清理后返回 `browser_command_not_found`，不能覆盖新的 host capability 或页面状态；跨连接同 host id 仍返回既有 `browser_host_id_conflict`。

## 验证

- `node --check src/browser-automation-manager.js`：通过。
- `node --check scripts/check-browser-host-generation-smoke.js`：通过。
- `npm run check:r129`：通过。
- Browser manager smoke：通过。
- `npm run check:browser`：通过，包含 manager、event scope、CDP、live automation 和 protocol alignment。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过；postcheck 实际执行 `check:r129` 及既有 Browser/Voice/Usage/Web/Daemon 回归，Docker runtime 按 opt-in 规则跳过。

## 未关闭的现场边界

该阶段只加强 Bridge host 生命周期和 action plan 安全边界，不提供新的 HarmonyOS Browser adapter。真实平台 host、恶意页面/登录态、上传下载、长流和 HarmonyOS App 全量动作仍需现场验收，第 16 项与第 23D 项继续保持“部分实现”。本轮未修改 ArkTS/HAP，未安装、启动或测试设备。
