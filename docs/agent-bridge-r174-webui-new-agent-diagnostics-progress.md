# R174：Web UI New Agent 对话框实现 + Diagnostics 导出现场验证（第 23B/34 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4 + 全量回归 EXIT=0）

## 1. 现场缺陷：Web UI 'New' Agent 按钮无实现（第 23B 项）

现场核查发现 Agents 区 'New' 按钮（index.html new-agent-button）只做了 feature 门控渲染（app.js 3946 行），**没有任何 click 监听器**——Web 工作台无法创建 agent（App/CLI/RPC 均可）。

## 2. 实现（src/web/index.html + app.js，备份 .bak-r174）

- `new-agent-dialog`（dialog 元素）：Provider 下拉（从 `state.providerCapabilities` 填充，空时回退 mock）、Workspace path 输入（默认当前 workspace path）、Workspace title 输入、Create/Cancel。
- `openNewAgentDialog()`：feature 门 + 填充 provider 列表 + 预填当前 workspace 路径。
NaN
- 监听器：`new-agent-button` → openNewAgentDialog；`new-agent-create-button` → createAgent。

## 3. 现场验证（真实 Chrome）

- 页面刷新加载新 bundle 后：点击 New → 对话框打开（provider 下拉渲染；本轮 providerCapabilities 未就绪时优雅回退 mock 单选项——降级设计生效）。
- 填入 workspace path + title → 点击 Create → 对话框关闭 → **agent.list 7->8，新增 `agt_zQeNBkk7hX1hR0Tn | R174 Web New Agent | ws wks_DWumDyEnZkNg3FT0`**（Web UI→agent.create→Bridge→mock provider 全链真实创建）；新 agent 自动选中（sessionStorage `ngf_web_agent_id`）。
- 契约 smoke 新增断言：new-agent-dialog/provider/workspace 元素存在、两个监听器接线、`send('agent.create')` 调用——`check-web-ui-contract-smoke.js` 通过（check:r13 链）。

## 4. Diagnostics 导出现场（第 34 项，真实 Chrome）

- Settings 对话框打开（dialog.open=true）→ 点击 'Export doctor text' → `detail-output` 渲染完整诊断报告（2355 chars）：`[daemon] info`（config/log/ledger 路径、host allowlist、nonce replay cache、trusted devices、autostart、runtime healthy）、`[provider] warning`（11 providers 0 available）、`[terminal] ok` 等分组。
- **脱敏现场复核**：报告全文不含 `123456`、`browser-live-token`、`DevEcoStudioProject` 绝对路径、`.ngf-agent-bridge` home 路径——R102 脱敏在 Web 消费路径真实生效。
- 对话框正常关闭。

## 5. 附注

- 本轮未修改 ArkTS/HAP；Bridge 全量 `npm run check`（含 r172/r173/r174 相关 postcheck）退出码 0（另行记录）。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling。