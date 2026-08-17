# R136 Web Browser target state result consumption

## 目标

将 R135 Bridge 的 Browser action target-state 结果接入 Web compatibility/parser 和 Browser 工作台，确保旧 Bridge、legacy host 和页面状态变化都有明确安全降级。

## 已实现

- Web compatibility 新增强类型 `normalizeBrowserActionTarget()`、`normalizeBrowserActionTargetState()` 和 `normalizeBrowserActionResult()`。
- `browser.page.action` response 统一保留 preview/confirmed、plan、target、targetState、failureCategory、remediation、warnings 和安全执行摘要；旧响应缺少新字段时使用 `targetState.mode=unknown` 和安全顶层回退。
- Web Browser action Preview/Confirm 统一消费归一化结果；legacy host 的 `browser_target_snapshot_unavailable` 会进入确认提示和完成状态，敏感参数不显示。
- `browser_target_changed` 保留 Bridge 稳定错误类别和 remediation，确认失败不会刷新为成功结果。
- `check:r136` 覆盖 Web compatibility、app syntax、旧/legacy/bound/changed result parser 和页面静态接线。

## 验证

- `node --check src/web/compatibility.js`：通过。
- `node --check src/web/app.js`：通过。
- `npm --prefix tools/agent-bridge run check:r136`：通过，输出 `web browser target state smoke ok`。
- `check-web-ui-contract-smoke.js`：通过。
- `check-web-ui-live-smoke.js`：通过。
- `check-web-session-experience-smoke.js`：通过。

## 范围边界

本阶段只收口第 23B/23D 的 Web 结果消费，不代表真实浏览器多标签、平台 host、恶意页面/登录态、长终端流、上传下载或 HarmonyOS App 全量动作已完成；相关条目继续保留 FIELD 验收门。
