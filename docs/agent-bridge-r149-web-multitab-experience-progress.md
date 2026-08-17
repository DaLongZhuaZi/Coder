# R149 Web multi-tab experience scope

更新时间：2026-08-10

## 目标

补齐 Web 工作台跨标签的 session experience 同步。既有 `BroadcastChannel` 已能同步 workspace、session、scope 和 logout，但 queue、usage、budget 与 Provider usage 的本地变更没有统一通知，兄弟标签可能继续显示旧状态。

## 已完成

- `src/web/app.js` 新增 `experienceTabScope()`，广播只携带 `hostProfileId`、`workspaceId`、`agentId`、`sessionId` 以及受限的 reason/queue/provider/window 元数据，不携带正文、token 或凭证。
- 新增 `broadcastExperienceChanged()` 和 `tabExperienceScopeMatches()`；接收端必须匹配完整的 host/workspace/agent/session scope，随后只调用 `refreshExperience()`，不会触发 workspace、Provider catalog 或其他 host 的全量刷新。
- queue cancel/retry、usage budget save/clear 和 Provider usage refresh 在成功完成后向同 scope 标签发送 `experience.changed`。
- 新增 `check:r149` 并接入 `postcheck`；复用多标签 scope smoke 验证事件定义、完整 scope gate、动作广播和局部刷新契约。

## 验证

本轮实际执行并通过：

- `npm run check:r149`
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check`
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
- `git diff --check`

Bridge 全量 `check` 主链和 `postcheck` 均退出码 0，`check:r149` 在 postcheck 中再次通过；Docker runtime 按仓库 opt-in 规则 skipped。本轮只修改 Node/Web/文档，没有修改 ArkTS/HAP；未执行 SDK 构建、设备安装、启动或测试。

## 仍待现场

- 真实浏览器双标签/多标签同时连接、标签后台唤醒和长会话 queue/usage 一致性。
- 旧 Bridge 缺少新事件时的真实兼容表现，以及多个 host/endpoint 并存验证。
- HarmonyOS App、真实 Provider usage/quota 和 Web Terminal/Diff 长流性能。

因此第 22、23B、34 及相关现场条目仍保持“部分实现”。
