# R108 Browser platform adapter fail-closed boundary

更新时间：2026-08-10

## 范围

本阶段收口第 16、23D 的平台 Browser host 注册边界：外部平台适配器的可用性探测属于不可信执行器调用，异常不能穿透 Bridge RPC，也不能把平台能力误发布为可用。

## 实现

- `createBrowserPlatformHostAdapter()` 对候选适配器的 `isAvailable()` 调用增加异常隔离；抛异常统一视为不可用。
- `validateBrowserPlatformHost()` 对直接注入的适配器同样采用 fail-closed 处理，异常返回稳定 `browser_platform_host_unavailable`。
- 已有 `validateRegistration()` 异常仍归一化为 `browser_platform_host_rejected`；普通 external/CDP host 不受影响。
- Browser manager smoke 增加 throwing adapter 断言，确保平台探测异常不会注册 host 或冒泡成未处理错误。

## 验证

- `npm run check:browser`：退出码 0；manager、event scope、CDP、live automation 和 protocol alignment smoke 全部通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0；主链与 postcheck 全部通过，Docker runtime 按 opt-in 规则 skipped。
- `git diff --check`：无实际空白错误，仅有既有换行转换提示。
- 本轮未修改 ArkTS/HAP，未安装、启动或测试设备。

## 边界

本阶段只证明平台 host 注册与能力发布的安全边界，不提供 HarmonyOS/其他受支持平台的真实 Browser adapter。真实凭证隔离、页面登录态、上传下载、恶意页面、长流和 App 全量动作仍需现场验收；第 16、23D 继续保持“部分实现”。
