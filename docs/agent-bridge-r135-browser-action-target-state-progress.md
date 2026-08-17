# R135 Browser action target state binding

## 目标

为需要确认的 `browser.page.action` 建立确认前后的真实页面状态绑定。R111 只提供公开目标摘要，本阶段增加受限 `page.snapshot` digest 校验，不保存页面正文。

## 已实现

- Preview 对支持 `page.snapshot` 的 host 发起只读快照请求。
- 快照先经过 Bridge 现有公共结果递归限制和敏感字段过滤，再在内存中计算 `pageId + instanceId + snapshot` 的 SHA-256 digest。
- plan 只保存请求 digest、host capability binding、target state mode/digest 和 warning，不保存快照正文。
- Confirm 重新读取绑定 host/page 的快照；digest 变化返回稳定 `browser_target_changed`，不派发 action。
- HarmonyOS/platform host 缺少 `page.snapshot`、返回失败或非法快照时 fail closed。
- 旧 external/CDP/native/custom host 不支持或暂时无法提供快照时保留兼容路径，并返回 `browser_target_snapshot_unavailable` warning。
- plan 仍受一次性消费、TTL、workspace/agent/action payload、上传文件摘要、host registration generation 和 capability digest 约束。
- manager smoke 覆盖状态变化拒绝、平台 host 缺能力拒绝和 legacy host warning。

## 验证

本阶段实际执行：

- `node --check src/browser-automation-manager.js`：通过。
- `node --check scripts/check-browser-automation-manager-smoke.js`：通过。
- `node scripts/check-browser-automation-manager-smoke.js`：通过，输出 `browser automation manager smoke ok`。
- `node scripts/check-browser-automation-live-smoke.js`：通过，输出 `browser automation live smoke ok`。
- `npm --prefix tools/agent-bridge run check:r135`：通过，包含以上 Node syntax、manager smoke 和 live smoke。
- `git diff --check`：通过；仅有既有 LF/CRLF 转换提示，无空白错误。

- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过，退出码 0；新增 `check:r135` 已在 `postcheck` 末尾执行。Docker runtime smoke 按 opt-in 规则跳过。
- 本轮没有 SDK/HAP 或设备操作需求。

## 范围边界

本阶段只收口 Bridge 的 Browser action target state 安全子阶段，不代表第 16 或 23D 整项完成。真实平台 Browser host、恶意页面/登录态隔离、上传下载、HarmonyOS App 全量动作和现场浏览器验收仍保留为 FIELD 门；不安装、启动或测试设备。
