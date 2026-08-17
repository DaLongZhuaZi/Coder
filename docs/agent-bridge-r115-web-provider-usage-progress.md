# R115 Web Provider usage details

## 范围

补齐 Web Session Experience 对 `provider.usage.list` 的消费，使 Web UI 与 HarmonyOS Agent Home 使用同一 Provider usage 直读协议。旧 Bridge 缺少 `providerUsage` feature 或当前 Provider descriptor 未声明能力时，不请求并隐藏整个区域。

## 实现

- Web compatibility 增加 `providerUsage` feature 和 `normalizeProviderUsage()`，限制状态、窗口、details、warning 和错误字段；缺失/非法数值保持 unavailable。
- Web Session Experience 状态增加 provider usage snapshot，并按当前 host/workspace/agent/session/provider scope 请求和校验结果。
- Usage 区新增 Provider usage 面板，展示 Provider、套餐、来源、availability state、抓取/过期时间、quota windows、plan details、warnings 和 remediation 状态。
- 增加手动刷新按钮，复用现有 in-flight guard；不改变 UsageManager 历史聚合，也不把直读详情伪装为 usage event。
- 旧 Bridge、无能力 Provider 和请求失败均安全降级，不显示原始 JSON 或敏感内部字段。

## 验证

- `node --check src/web/compatibility.js`：通过。
- `node --check src/web/app.js`：通过。
- `node scripts/check-web-session-experience-smoke.js`：通过。
- `npm run check:r88`：通过（session experience smoke/live）。
- `npm run check:web-live`：通过。
- `npm run check:browser`：通过（Browser/协议回归）。
- `git diff --check`：无实际空白错误；仅有既有 LF/CRLF 转换提示。
- 本阶段只修改 Node/Web UI 与 smoke，没有 ArkTS/HAP 变更，未安装、启动或测试设备。

## 未关闭边界

真实 Provider quota/账单、长会话、旧 Bridge 多标签现场和 HarmonyOS App/Web 浏览器现场仍需现场验收；第 22、34、23B 保持“部分实现”。
