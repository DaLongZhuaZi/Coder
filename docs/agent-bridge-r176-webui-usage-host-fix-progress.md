# R176：Web UI Usage 面板无法看到自身用量 —— hello host 身份缺陷修复（第 22/34 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4 + 全量回归 EXIT=0）

## 1. 缺陷发现

Web UI Session Experience 现场验证（R176 轮）：通过 Web UI composer 发送消息后，Usage 面板仍显示 `No usage events for this session` + 全部 unavailable；而 Bridge 侧 `usage.summary.get`（hostless）能看到同一会话的 actual 10/5/15 + $0.15 + quota 90/100 + compaction。

根因（`src/web/app.js`）：Web UI 的 **hello 握手不携带 hostProfileId**（`send('hello', {clientId, appNonce, appName, appVersion, protocolVersion})`），而 `refreshAllInternal` 稍后才把 `state.hostProfileId` 解析为 `'web-host'`。于是：Web UI 自己发送的消息产生的 usage 事件被记录为 **hostless**（hello 无 host），而 Usage 面板的 `usage.summary.get` 查询携带 `hostProfileId: 'web-host'`——事件与查询永远不匹配，面板永远看不到自身用量。R9/R162 的 host 隔离语义使该缺陷隐蔽（事件仍按来源连接投递，只是汇总查询为空）。

## 2. 修复（src/web/app.js，备份 .bak-r176）

- hello 前先解析稳定 host 身份：`state.hostProfileId = state.hostProfileId || 'web-host'`，并在 hello payload 中携带 `hostProfileId: state.hostProfileId`——记录与查询两侧统一为 `web-host`，跨 Web 标签共享同一 host scope（与 R149 多标签同步设计一致）。

## 3. 现场验证（真实 Chrome）

- 页面刷新加载修复后 bundle → 选择新会话 agent → Web UI composer 发送 `R176b web usage message` → **Usage 面板完整显示生产链数据**：
  - Actual tokens：input 10 / output 5 / total 15
  - Estimated tokens：total 20
  - Actual cost：0.15 USD
  - Compactions：1（200 → 80，automatic，带时间戳）
  - Quota：mock · session · Remaining 90 / 100 · reset 时间
  - 事件明细：usage actual（tokens 15 / cost 0.15 USD）、usage estimated（tokens 20）
- 修复前同场景：`No usage events for this session`。

## 4. 回归 smoke

- `check-web-ui-contract-smoke.js` 新增断言：hello 前解析稳定 host 身份 + hello 携带 hostProfileId——通过。
- Bridge 全量 `npm run check`（postcheck 含 r172/r173/r174/r176 相关）退出码 0（另行记录）。

## 5. 附注

- App 端（AgentBridgeClient）在 hello 前已从持久化 host profile 解析 hostProfileId，不受此缺陷影响。
- 本轮只修改 Web app.js；无 ArkTS 改动，无需 SDK 23 构建。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling、codex exec discovery 性能。