# Agent Bridge R22 Browser host capability progress

更新时间：2026-08-08

## 目标

在不伪造 HarmonyOS 或其他平台 Browser host 的前提下，明确 Bridge 能识别和执行的 host 类型、运行时、能力来源、支持平台及 readiness。旧 Browser host 注册 payload 继续兼容。

## 本轮完成

- [x] Browser host 公开可选 `hostKind`、`runtime`、`capabilitySource`、`readiness`、`supportedPlatforms` 和 `capabilityWarnings`。
- [x] Bridge 对 host kind/source/readiness/platform metadata 做规范化；HarmonyOS host 若未声明 `platform` capability source 直接返回 `browser_host_capability_unverified`。
- [x] `ready` 以外的 host 可以展示诊断状态，但不会被 command dispatch 选中；请求返回稳定 `browser_host_not_ready` 和 remediation。
- [x] `serverInfo.features.browserHostCapabilityMetadata=true`，同时明确 `browserPlatformHost=false`，避免把普通 CDP/external host 当作平台适配器。
- [x] `BrowserCdpHost` 在完成 CDP endpoint 校验后注册 `hostKind=cdp`、`runtime=chromium`、`capabilitySource=cdp`、`readiness=ready` 和当前桌面平台。
- [x] manager/CDP/protocol 定向 smoke 覆盖旧 payload、未验证 HarmonyOS、degraded host、CDP metadata 和 readiness gate。

## 实际验证

- `node --check src/browser-automation-manager.js`：退出码 0。
- `node --check src/browser-cdp-host.js`：退出码 0。
- `node scripts/check-browser-automation-manager-smoke.js`：`browser automation manager smoke ok`，退出码 0。
- `node scripts/check-browser-cdp-host-smoke.js`：`browser CDP host smoke ok`，退出码 0。
- `node scripts/check-protocol-alignment-smoke.js`：`protocol alignment smoke ok`，退出码 0。

## 未关闭边界

- `browserPlatformHost=false` 是事实声明：当前仓库没有可真实证明的 HarmonyOS WebView/平台 Browser host adapter。
- HarmonyOS App 全量动作、受支持平台 host、真实恶意页面/登录态/上传下载、多标签长流仍需现场或后续平台实现。
- 本轮只修改 Bridge/host smoke，没有生成 HAP，也没有设备安装。

## 下一步候选

- R23：在有官方平台 API 与真实 host 实现后，接入平台 adapter 并把 `browserPlatformHost` 改为运行时 capability，而不是静态 true。
- FIELD：真实 Browser host、HarmonyOS App 全量动作和长流/多标签验证。
