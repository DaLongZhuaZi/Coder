# R146 Web Usage Window Scope

更新时间：2026-08-10

## 目标

收口 Web Session Experience 中 usage、quota、budget 的时间窗口选择。Bridge 已支持 `session`、`day` 和 `month`，但 Web 旧实现始终发送 `window=session`，导致日/月诊断请求无法真正切换范围。

## 已完成

- Web Usage 面板新增 `session`、`day`、`month` 选择器。
- usage summary、events、budget status 和 Provider usage 请求使用同一当前窗口；queue 请求保持独立，不把 usage window 混入队列 scope。
- usage scope key 包含窗口，切换窗口会清理旧结果并重新请求，避免把 session 数据留在 day/month 视图。
- 返回结果若回显不同窗口，页面显示受控降级提示；旧 Bridge 缺少可选窗口字段时不崩溃，仍保留兼容默认值。
- Provider usage 手动刷新沿用当前窗口和既有 connection generation/in-flight guard。

## 验证

本轮实际执行并通过：

- `npm run check:r146`
- `npm run check:r28`（live Bridge 查询 `session/day/month`）
- Node syntax check（Web app、smoke）
- `git diff --check`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`

全量 check 中 Docker runtime smoke 按仓库既有 opt-in 规则跳过。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。

## 仍待现场

- 真实 Provider 的日/月 quota endpoint、账单和长会话现场数据。
- 旧 Bridge、多标签窗口切换和 HarmonyOS App Usage 展示。

第 22、34、23B 继续保持“部分实现”，本记录只关闭 Web usage window 的源码和自动化子阶段。
