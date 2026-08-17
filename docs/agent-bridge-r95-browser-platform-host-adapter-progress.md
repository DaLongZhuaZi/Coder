# R95 Browser 平台 Host 适配器边界

更新时间：2026-08-09

## 目标

继续收口第 16、23D 的平台 Browser host 安全边界。现有 Bridge/CDP/Web 控制面支持外部 host，但不能把客户端自报的 `harmonyos`/`platform` metadata 当成真实平台适配能力。

## 已完成

- [x] 新增 `tools/agent-bridge/src/browser-platform-host.js`，定义平台 host 注册识别、默认不可用适配器和稳定拒绝结果。
- [x] `BrowserAutomationManager` 注入适配器并在 host 注册前执行可用性/注册校验；默认 Bridge 对平台 host 返回 `browser_platform_host_unavailable`。
- [x] 公开 host DTO 增加可选 `platformHost` 标识；旧 App 忽略该字段，现有 external/CDP host 行为不变。
- [x] `serverInfo.features.browserPlatformHost` 改为适配器可用性，而不是静态声明；当前默认值仍为 `false`。
- [x] 定向 smoke 覆盖默认拒绝、HarmonyOS capability source 校验和注入测试适配器后的受控注册；`check:browser` 纳入新模块语法检查。

## 实际验证

```text
node --check src/browser-platform-host.js
node --check src/browser-automation-manager.js
node --check src/server.js
node --check scripts/check-browser-automation-manager-smoke.js
node --check scripts/check-protocol-alignment-smoke.js
node scripts/check-browser-automation-manager-smoke.js
node scripts/check-protocol-alignment-smoke.js
npm run check:browser
```

以上命令本轮均退出码 0。Bridge 全量 `npm run check`、SDK 23 HAP 和设备安装未在本源码子阶段执行；本轮没有 ArkTS/HAP 修改，也没有安装、启动或测试设备。

## 未关闭门

- [ ] 注入真实 HarmonyOS/受支持平台 Browser adapter，并完成官方 API、权限、登录态、上传/下载和恶意页面现场验证。
- [ ] HarmonyOS App 全量 Browser action、多标签、旧 Bridge、长流和真机现场仍由第 16、23D 的 FIELD 轨道管理。

R95 只关闭平台 host 注册安全契约源码子阶段，第 16、23D 继续保持“部分实现”。
