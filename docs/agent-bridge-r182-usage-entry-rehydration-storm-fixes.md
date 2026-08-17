# R182：App 用量面板入口修复 + Bridge 会话再水合 + Web 刷新风暴治理（第 22/23B 项）

日期：2026-08-16
状态：已实测（真机 ADA-AL00U + Bridge 0.1.4 + SDK 23 HAP + 截图/布局/hilog/HTTP RPC 多重证据）

## 1. App 端「会话数据/用量」入口修复（ArkTS）

- R181 发现竖屏下用量面板入口受阻：底部状态条点击区被输入框扩展区（y2625）/发送键（y2618）覆盖，命令面板「会话数据」仅 EXPANDED 工作台启用。
- 修复（`entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`，备份 `.bak-r182`）：
  - `executeRegisteredCommand` 的 FOCUS_RIGHT_PANE 分支：EXPANDED 模式保持焦点右栏；非 EXPANDED（竖屏）改为 `openSheet(AgentHomeSheetKey.SESSION_DETAILS)`。
  - `pushPaneCommandDefinitions` 的 FOCUS_RIGHT_PANE 命令 enabled 条件改为 `true`（竖屏可用）。
  - 附带尝试的状态条 info 按钮方案（点击区在死区无响应）已回退，保留原状态条外观。
- 真机验证（最终 HAP）：菜单 → 命令面板 → 搜索 details → 会话数据 → sheet 打开；滚动到底部**用量面板渲染真实数据**（见第 4 节）。

## 2. Bridge 会话再水合缺陷修复（Node）

- 缺陷：Bridge 重启后 agent 记录（含 providerSessionId）持久化保留，但 mock provider 的运行时会话对象是纯内存的 → `message.send`/`session.messages` 对重启前会话返回 session_not_found（真机 App 发送失败复现 + HTTP RPC 复现）。
- 修复：
  - `src/providers/mock-provider.js`（备份 `.bak-r182`）：新增幂等 `ensureSession(payload)`（按持久化 id 重建会话对象），`createSession` 复用同一实现。
  - `src/server.js`（备份 `.bak-r182`）：`ensureProviderSessionForAgent` 早退分支（providerSessionId 已存在）在 `registry.findSession` 未命中时调用 provider 可选 `ensureSession` 契约再水合；`agent.attach` 无条件走 ensure；`message.send` 与 `session.messages` 在 findSession 未命中时按 `agentManager.findBySessionId` 查找 agent 并 ensure 后重试。
  - 定向 smoke：`scripts/check-session-rehydrate-smoke.js`（创建会话→发消息→重启 Bridge→验证 agent 记录存活且 message.send/session.messages 再水合成功）通过；接入 `check:r182` 与 postcheck。
- 现场验证：现场 Bridge 重启后 HTTP RPC `message.send` 对旧会话 `ses_2ec7c13c28cd8caf` 返回 accepted:true 并 message.completed；App 随后成功发送 usage-test。

## 3. Web UI 刷新风暴治理（第 23B 项）

- 现场故障：Bridge（pid 28564）自 12:45 起单核 ~100% CPU 持续燃烧，15:33:52 后事件循环完全停摆（/health 超时、RPC 超时）。
- 根因：5 个旧 Web UI 标签（R169-R179 遗留，Chrome 9224）每 15s 全量刷新（含 4.1s 的 workspace.changes.get git 批枚举 + 对 3 个已失效会话的 session.messages 轮询，每个未命中触发 provider 会话发现）。关闭 5 个标签后 Bridge CPU 立即平稳（127.7 不再增长）。
- 修复（`src/web/app.js`，备份 `.bak-r182`）：
  - `setRefreshTimer`：`document.hidden` 时跳过本轮刷新（后台标签不再轰炸）。
  - `refreshSessionInternal`：session.messages 返回 session_not_found 时记录 `sessionMessagesStaleFor=sessionId`，同一会话后续刷新不再轮询（会话切换后自动恢复）。
- 契约 smoke 新增 4 条断言（`check-web-ui-contract-smoke.js`）并通过。

## 4. 真机用量面板最终证据（第 22 项 App 侧闭环）

- 链路：App 发送 usage-test → Bridge（修复后）accepted → mock 回复 + `usage.updated` 事件按 App 宿主作用域（host_FcANS2KgT119bNT）落库 → App「会话数据」面板：
  - 上下文压缩记录：`200 → 80 · mock · 2026-08-16 16:04:35 · automatic`
  - 配额：mock / mock-provider，剩余 90 / 上限 100，窗口 会话，重置 2026-08-16 17:04:35
  - 统计窗口 会话/当天/当月 + Token/费用预算 + 保存/清除预算 + 刷新用量/导出诊断/刷新队列
  - 最近用量事件：`真实用量 · 输入估算: 10 · 输出估算: 5 · 总量估算: 15 · USD 0.15 · mock · 2026-08-16 16:04:35`、`估算用量 · 总量估算: 20 · mock · 2026-08-16 16:04:35`
- 截图：`.local-rules/screen-r182c.jpeg`。
- Bridge 侧作用域复验：HTTP RPC 按 App 作用域 `usage.summary.get` 返回 eventCount=3/actual=1(input 10/output 5/total 15)/estimated 20/compactions=1/quota 90/100。

## 5. 构建与回归证据

- SDK 23 HAP：`assembleHap --no-daemon` 退出码 0，`entry-default-signed.hap` 14,558,715 bytes，SHA-256 `F8199859581F45A2CCC50B785361CD3FBEA76271B3EC5A59BE126B92E42E3FEC`，已安装真机（`install bundle successfully` + `aa start`）。
- Bridge 全量回归：`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` CHECK_EXIT=0；`npm run postcheck` POSTCHECK_EXIT=0（含 check:r182）。
- `git diff --check`（.ets）退出码 0；`node --check`（server.js/mock-provider.js/app.js/smoke）全部通过。

## 6. 仍待 FIELD

- 真实 Codex App Server quota（本机发现 pid 38968 运行 `codex app-server`，未启用为 Bridge provider）、真实 Provider、真实 GitHub、多 Bridge rolling。
