# R141 Web Composer Mention Progress

**日期**：2026-08-10  
**范围**：Web UI composer token、`@` 补全和消息发送协议；不改变 HarmonyOS App 页面。

## 已完成

- `compatibility.js` 增加 composer token kind/parser，未知 kind 降级为 `text`，列表限制为 100 项并保留旧字段安全默认值。
- `app.js` 的 composer 只从当前 host/workspace scope 构造 workspace、agent 和已加载文件候选；文件候选经过相对路径校验，普通文本中的 `@` 不会自动变成可信 token。
- 注册输入、上下键、Enter/Tab 确认、Escape 关闭和失焦延迟关闭；token 标签支持移除，scope 切换、归档、断线、重新登录时清理 token。
- Web 发送优先调用 `message.send`，携带 `clientMessageId`、`queuePolicy=queue` 和 `composerTokensJson`；旧 Bridge 对未知 RPC 回退到 `agent.send`。发送失败保留草稿，成功后清理文本和 token。
- Bridge 的旧 `agent.send` handler 同样调用 `sanitizeComposerTokens`，不会绕过 host/workspace/path 校验。
- 新增 `check-web-composer-smoke.js`，覆盖 parser 边界、HTML 无障碍关系、键盘路径、payload、安全路径、旧 handler 校验和危险 DOM API；`check:r141` 已纳入 `postcheck`。

## 本次验证

- `node --check`：`app.js`、`compatibility.js`、`check-web-composer-smoke.js`，通过。
- `node tools/agent-bridge/scripts/check-web-composer-smoke.js`，输出 `Web composer smoke passed.`。
- `npm --prefix tools/agent-bridge run check:r141`，通过。
- `npm --prefix tools/agent-bridge run check:r13`、`check:r88`、`check:browser`，通过。
- `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`，通过；Docker runtime smoke 按 opt-in 规则 skipped。
- 本轮未修改 ArkTS/HAP，未执行 SDK 构建，未安装、启动或测试设备。若后续形成重大安装包，只允许安装到 `5KLBB25A10203862`，且仅安装。

## 未关闭现场门

本阶段只收口 Web composer 源码子阶段，不将 23B、22 或 34 标记为完全实现。真实旧 Bridge、多标签、长消息流、真实 Provider、HarmonyOS App 全量动作和指定设备展示仍由现场轨道验收。
