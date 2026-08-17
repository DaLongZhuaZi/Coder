# R13 Web Legacy Bridge Compatibility

更新时间：2026-08-08

## 目标

收口 Web UI 对旧 Bridge、缺少可选字段、未知事件和可选 RPC 不可用的源码兼容边界。R13 只证明 Web 控制面的兼容逻辑和自动化，不替代真实双标签、旧版本 Bridge、长 terminal/diff 流、真实浏览器或 HarmonyOS App 现场验收；23B/23D 继续保持部分实现。

## 本轮实现

- 新增 `tools/agent-bridge/src/web/compatibility.js`，提供无 DOM 的兼容归一化 API：
  - `normalizeBridgeCapabilities()` 统一读取 `/health` 与 `serverInfo.features`，区分 capability 已发布与旧 Bridge 缺少 feature 广告。
  - `featureEnabled()` 作为 Web 增强入口的唯一 feature gate；旧 Bridge 默认只保留 Agent/chat/workspace 核心路径。
  - `normalizeAgentAttach()`、`normalizeSessionMessages()` 支持现代 `messages`、旧 `timeline`、旧数组和缺字段降级。
  - `normalizeWorkspaceRegistry()` 保留 registry list，同时允许页面回退 Agent workspace 列表。
  - `normalizeOptionalFailure()` 将未知 RPC/未实现映射为 `legacy_rpc_unsupported`，普通断线等错误保持 `rpc_failed`。
  - `normalizeEvent()` 与 `eventMatchesScope()` 丢弃未知事件和不匹配当前 host/workspace/agent/session 的迟到事件。
- `app.js` 统一消费兼容状态；刷新阶段只生成一次 capabilities，Session、workspace、diagnostics 和增强入口复用该状态。
- `index.html` 以同源静态资源加载兼容模块；Bridge 现有静态资源安全边界无需新增后端路由。
- contract smoke 增加兼容模块加载、feature gate、旧 session/workspace fallback、optional failure 和 event scope 静态断言；live smoke 验证 `/app/compatibility.js` 的 CSP/同源资源服务。

## 本轮实际验证

```text
node --check tools/agent-bridge/src/web/compatibility.js
node --check tools/agent-bridge/src/web/app.js
node --check tools/agent-bridge/scripts/check-web-compatibility-smoke.js
node --check tools/agent-bridge/scripts/check-web-ui-contract-smoke.js
node tools/agent-bridge/scripts/check-web-compatibility-smoke.js
node tools/agent-bridge/scripts/check-web-ui-contract-smoke.js
node tools/agent-bridge/scripts/check-web-ui-live-smoke.js
npm --prefix tools/agent-bridge run check:r13
```

以上命令本轮均退出码 0。随后执行的 `npm --prefix tools/agent-bridge run check` 也退出码 0，且 `postcheck` 实际运行了 R12 与 R13 smoke；本轮没有生成 HAP，也没有向设备安装。

## 兼容边界

- 缺少 `health.features` 和 `serverInfo.features` 时不猜测增强能力，隐藏 terminal binary、workspace files、Git advanced、Browser、GitHub、diagnostics 等入口；Agent list/attach/send 与 attach 返回的 timeline 继续可用。
- `session.messages` 不支持、响应缺少新字段或响应为空时，页面保留 attach payload 的 messages/timeline；不能把一次失败的 optional RPC 当成全量刷新失败。
- `workspace.registry.list` 不支持时，页面继续从 Agent 的 workspaceId/cwd 构造只读 fallback；导入缺少新 RPC 时仍由既有 workspace create fallback 处理。
- 未知事件直接忽略；事件 payload/外层 sessionId 与当前 scope 冲突时不更新 UI。缺少 scope 字段的旧事件仍可兼容处理。
- 真实旧 Bridge、双标签、长流、浏览器和 HarmonyOS App 全量动作仍由 R6-WEB-3、R7、R8 与 FIELD 现场轨道负责。
