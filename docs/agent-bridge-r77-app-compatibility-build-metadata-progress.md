# R77 App compatibility build metadata integrity

更新时间：2026-08-09

## 目标

让当前 HarmonyOS App 版本只来自构建元数据，不再用 `1.0.0` 作为运行时伪造值。版本缺失或 BundleInfo 读取失败时，Bridge 收到空版本并将兼容状态保持为 `unknown`；旧 Bridge 继续按缺失可选字段安全降级。

## 已完成

- [x] `AgentBridgeConnectionConfig`、`AgentBridgeHelloPayload` 和 `AgentBridgePushRegisterPayload` 的 `appVersion` 默认值改为空字符串。
- [x] `AgentBridgeClient.registerPushToken()` 与会话子窗口 controller 不再注入 `1.0.0`。
- [x] Agent Home 主窗口和会话子窗口均从 `bundleManager.getBundleInfoForSelf()` 读取并 trim `versionName`；读取失败或空值保持 unavailable。
- [x] 主窗口连接、Relay pairing、Fleet 请求和 Push 注册继续传递实际已读取版本；缺失时透传空值。
- [x] 新增 `check-app-compatibility-build-metadata-smoke.js`，覆盖静态调用链、缺失版本的 `unknown`/非 blocking、有效版本兼容和低版本阻断。
- [x] `check:r77` 已接入 `tools/agent-bridge/package.json` 的 `postcheck`。

## 实际验证

```text
node --check scripts/check-app-compatibility-build-metadata-smoke.js
node scripts/check-app-compatibility-build-metadata-smoke.js
npm run check:r77
```

本轮实际执行 R77 定向 smoke、`npm run check:r77`、Bridge 全量 `npm run check` 和 SDK 23 `assembleHap --no-daemon --stacktrace`，均退出码为 0；HAP `entry/build/default/outputs/default/entry-default-signed.hap` 大小 `14,380,901` bytes，SHA-256 `71C84A6231CBF43719D0A5CDF496DC3210DD18D4E02F7408F73AA4250D77248A`。本轮未向任何设备安装、启动或测试。指定设备约束保持为：如后续重大功能更新需要安装，只允许尝试 `5KLBB25A10203862`，且只安装不启动/测试。

## 未关闭的现场门

真实旧/新 Bridge 版本矩阵、BundleInfo 异常现场、兼容卡真机展示以及 Provider quota/metadata 仍由第 22、34 项 FIELD 轨道验收；本 R77 子阶段不改变这些总项的“部分实现”状态。
