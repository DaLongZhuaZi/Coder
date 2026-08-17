# R65 Web multi-tab scope and refresh precision

更新时间：2026-08-09

## 目标

收口清单 23B 的一个源码缺口：多个 Web UI 标签页可以同时连接不同 Bridge endpoint 或 host profile 时，跨标签事件必须按 endpoint/host/session scope 过滤；workspace/session 变化只刷新受影响的局部状态，不触发不必要的全量刷新。

## 实施范围

- `tools/agent-bridge/src/web/app.js`
  - BroadcastChannel 消息携带 endpoint 与 hostProfileId scope。
  - 接收端拒绝跨 endpoint、跨 host profile 的 refresh/workspace/scope/session 事件；logout 保持同 endpoint 的全标签传播。
  - workspace.changed 只刷新 workspace registry，并在当前 workspace 受影响时刷新 session。
  - scope.changed 与 session.changed 只在当前选中 scope 匹配时刷新 session。
- `tools/agent-bridge/scripts/check-web-multitab-scope-smoke.js`
  - 覆盖消息 scope 元数据、过滤入口、局部 workspace refresh、active session 过滤和 logout 兼容。
- `tools/agent-bridge/package.json`
  - 新增 `check:r65` 并接入 `postcheck`。

## 验证

本轮实际通过：

- `node --check src/web/app.js`
- `node --check scripts/check-web-multitab-scope-smoke.js`
- `node scripts/check-web-multitab-scope-smoke.js`
- `node --check scripts/check-web-compatibility-smoke.js && node scripts/check-web-compatibility-smoke.js`
- `node --check scripts/check-web-ui-contract-smoke.js && node scripts/check-web-ui-contract-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`（退出码 0；包含 `check:r65`）
- `git diff --check`

结果：定向 smoke、Web compatibility/UI contract 和 Bridge 全量 check 均退出码 0。仅记录 Node/Web 源码验证；未重新构建或安装 HAP。

本阶段只修改 Node/Web，不需要重新构建或安装 HAP；真机 WebView、多标签浏览器行为、真实旧 Bridge 与长终端流仍属于 23B 现场验收门。
