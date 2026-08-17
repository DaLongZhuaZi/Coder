# R36 Browser App capability/readiness progress

更新时间：2026-08-09

## 目标

依据对齐清单第 16、23D 的实际缺口，补齐 HarmonyOS App Browser 面板对 Bridge host capability metadata 的强类型解析、readiness gate、上传范围提示、下载状态和受控错误 remediation。Bridge/CDP/Web 的既有操作链不重复实现；真实平台 host、浏览器服务和真机仍单独作为 FIELD 门。

## 本轮源码完成

- [x] `AgentBridgeServerFeatureFlags` 增加可选 `browserHostCapabilityMetadata` 与 `browserPlatformHost`，缺字段安全默认为 `false`。
- [x] `AgentBridgeBrowserHostRecord` 和 parser 接入 `hostKind`、`runtime`、`capabilitySource`、`readiness`、`supportedPlatforms`、`capabilityWarnings`；旧 host payload 仍可解析。
- [x] App Browser host 卡展示受支持平台、运行时、能力来源和 readiness；能力警告只显示受控数量，不渲染 host 原始 warning 文本。
- [x] 新 capability 打开时，degraded/unavailable host 可查看诊断但不会被实例、页面、导航、snapshot、screenshot、logs、wait、download 或 action dispatch 使用；旧 Bridge 保留 legacy gate。
- [x] App 优先选择 ready host；没有 ready host 时显示受控空状态，避免静默向 degraded host 发起操作。
- [x] Browser failure category 映射为受控 i18n 文案和安全重试提示，不再直接显示 Bridge 原始 message/remediation；上传控件明确只接受 workspace-relative 路径。
- [x] Parser 测试覆盖 metadata、readiness、warnings、feature flag 和既有下载字段。

## 本轮验证结果

- [x] ArkTS parser/model 断言已纳入工程测试源码，SDK 23 ArkTS 编译阶段通过；未执行真机测试。
- [x] `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 退出码 0；Browser、Web、协议、Provider、daemon、MCP/CLI 和 postcheck 全部通过。既有 `node-pty` AttachConsole stderr 仍存在，但对应 terminal smoke 通过。
- [x] SDK 23 `assembleHap --no-daemon --stacktrace` 退出码 0，`BUILD SUCCESSFUL in 56 s 568 ms`。
- [x] HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,246,450 bytes，SHA-256 `F15C24A2F0A8BC393F5292984EDB0C317960874D209EE945ECA5BBF795E39461`。
- [x] 仅向 `5KLBB25A10203862` 执行一次 `hdc install -r`；返回 HDC `9568423`（签名 profile 未授权设备 UDID）。未启动、未截图、未读日志、未做设备测试，也未向其他设备安装。
- [x] `git diff --check` 退出码 0；仅有既有 CRLF 转换提示。

## 当前边界

- [ ] 仓库仍没有可真实宣称的 Electron/HarmonyOS/其他受支持平台 Browser host adapter。
- [ ] 真实上传、下载、恶意页面、登录态、跨标签和长流仍需 FIELD；本轮源码 smoke 不替代现场证据。
- [ ] 因此第 16、23D 继续保持“部分实现”。

## 源码子阶段结论

R36 的 App capability/readiness、ready-only dispatch、受控错误边界、下载状态和 workspace-relative 上传提示已完成并通过本轮自动化、SDK 23 编译和差异检查。第 16、23D 仍保持“部分实现”，真实平台 host、浏览器服务、上传下载、恶意页面、登录态、多标签长流和真机全量动作继续作为 FIELD 验收门；指定设备安装阻断仅由签名 profile UDID 授权造成，不改变源码验证结论。
