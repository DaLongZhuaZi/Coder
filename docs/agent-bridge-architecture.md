# Agent Bridge App 架构启动方案

> 目标：在 NGF 框架基础上构建一款 HarmonyOS App，用于连接电脑上的 Claude Code、Codex、OpenCode 及其衍生版本，并提供会话管理、会话沟通、工具事件、权限确认和内容预览能力。

## 1. 架构边界

第一阶段采用三层结构：

```text
HarmonyOS App
  -> Agent Bridge Server
    -> Provider Adapter
      -> Codex / OpenCode / Claude Code / Custom Agent
```

### HarmonyOS App

职责：

- 管理远端主机配置、连接状态、会话列表和当前会话 UI。
- 通过统一协议发送用户消息、工具确认、取消请求和预览请求。
- 展示流式消息、工具调用、文件预览、diff、任务状态和错误。
- 使用 NGF 既有 `uiShell`、`data`、`systemTasks`、`webBridge`、`network` 能力。

不直接承担：

- 不直接适配 Codex / Claude Code / OpenCode 的 CLI 差异。
- 不在首版实现完整 SSH 客户端、PTY 终端模拟或 shell TUI 控制。
- 不在移动端保存第三方 Agent 的访问令牌或云端凭据。

### Agent Bridge Server

职责：

- 运行在用户电脑上，作为移动端和本机 Agent CLI/SDK 之间的稳定协议层。
- 统一鉴权、会话状态、事件流、工具权限请求和预览资源访问。
- 提供可替换 Provider Adapter，使不同 Agent 只需要实现同一套内部接口。
- 后续可以通过 SSH 隧道、局域网、反向代理或配对码暴露给 App。

### Provider Adapter

职责：

- 封装单个 Agent 的实际通信方式。
- 将 Agent 的消息、工具调用、文件变更、权限请求转换为统一事件。
- 第一批适配优先级：OpenCode -> Codex -> Claude Code -> Custom.

## 2. 为什么先做桌面 Bridge

各 Agent 的远程能力不一致：

- OpenCode 提供 server 模式，适合作为首个端到端验证对象。
- Codex CLI 提供远程 app-server/WebSocket 形态，适合作为第二个适配对象。
- Claude Code 更适合在桌面端通过 Agent SDK 或本机包装层接入。

如果 App 第一版直接做 SSH + 交互式终端，会把协议差异、TTY 渲染、权限弹窗、文件预览和会话恢复都压到 ArkTS 侧，风险和调试成本过高。

## 3. 第一阶段 MVP

第一阶段只交付最小闭环：

1. 电脑运行 `tools/agent-bridge`。
2. App 或调试客户端通过 token 连接 Bridge。
3. 获取 Bridge 健康状态和 Provider 能力。
4. 创建一个会话。
5. 发送一条用户消息。
6. 收到统一事件流。
7. 请求一个文本预览或 diff 预览。

首个 Provider 使用 `mock`，用于打通协议和 UI；OpenCode Provider 作为第一条真实 Agent 接入链路。

## 4. 统一协议

### HTTP

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | Bridge 存活检查 |
| `GET` | `/capabilities` | 返回协议版本和 Provider 能力 |
| `GET` | `/preview?sessionId=...&path=...` | 返回文本预览或 Provider diff |

### WebSocket

路径：`/ws`

所有消息使用 JSON 文本帧。

客户端请求：

```json
{
  "id": "req-1",
  "type": "session.create",
  "payload": {
    "providerId": "mock",
    "workspacePath": "F:/DevEcoStudioProject/Coder"
  }
}
```

服务端响应：

```json
{
  "id": "req-1",
  "type": "response",
  "ok": true,
  "payload": {
    "sessionId": "ses_..."
  }
}
```

服务端事件：

```json
{
  "type": "event",
  "event": "message.delta",
  "sessionId": "ses_...",
  "payload": {
    "role": "assistant",
    "text": "..."
  },
  "createdAt": 1781510400000
}
```

## 5. 事件类型

第一阶段事件集：

| 事件 | 说明 |
|------|------|
| `session.created` | 会话已创建 |
| `session.updated` | 会话状态变化 |
| `message.delta` | 助手流式文本片段 |
| `message.completed` | 助手消息完成 |
| `tool.started` | 工具调用开始 |
| `tool.output` | 工具输出 |
| `tool.completed` | 工具完成 |
| `permission.requested` | Agent 请求用户批准 |
| `preview.updated` | 文件或 diff 预览变化 |
| `error` | 统一错误事件 |

## 6. 数据落点

建议分阶段落点：

- `tools/agent-bridge/`：桌面 Bridge 服务和 Provider Adapter。
- `docs/agent-bridge-architecture.md`：架构说明和协议草案。
- `entry/src/main/ets/features/agentBridge/`：后续 App 业务客户端、状态模型、页面 ViewModel。
- `entry/src/main/ets/pages/agent/`：后续 App 业务页面。
- `ngf_framework/src/main/ets/network/`：只有当 WebSocket/SSE/流式事件能力足够通用时再下沉。
- `ngf_framework/src/main/ets/data/`：只有当会话缓存、连接配置或加密存储形成通用能力时再下沉。

## 7. 安全基线

第一阶段必须满足：

- Bridge 默认只监听 `127.0.0.1`。
- 允许用户显式配置 host 后再监听局域网地址。
- 所有非 `/health` 请求必须携带 `Authorization: Bearer <token>` 或 WebSocket 查询参数 token。
- token 由 Bridge 首次启动生成或通过环境变量传入。
- 不在 Git 中保存 token、主机地址、私钥、第三方账号凭据。
- Provider Adapter 不允许默认执行危险 shell 命令；权限请求必须统一进入 `permission.requested`。

## 8. 实施顺序

1. API 基线回到 HarmonyOS 6.1.0 (API 23)。
2. 搭建 `tools/agent-bridge`，提供 HTTP/WS 协议和 mock provider。
3. 在 App 侧新增连接配置与会话状态模型。
4. 新增 Agent 主页面：主机列表、会话列表、消息流、工具/预览面板。
5. 完善 OpenCode provider 的事件流订阅与权限映射。
6. 接入 Codex provider。
7. 接入 Claude Code provider。
8. 再评估是否需要 SSH 隧道、桌面端安装器、配对码和局域网发现。
