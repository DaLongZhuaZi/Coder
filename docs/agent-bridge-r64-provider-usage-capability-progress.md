# R64 Provider usage capability gate

更新时间：2026-08-09

## 目标

继续收口清单第 22、34 项的 Provider-specific capability 语义：App 不应仅因为 Bridge 全局支持 `provider.usage.list` 就向不支持套餐查询的 Provider 显示刷新入口；旧 Bridge 缺少 descriptor 字段时仍保持既有兼容行为。

## 实施范围

- `ProviderRegistry` 在公开 Provider descriptor 中增加可选 `capabilities.providerUsage`。
- 只有 Provider adapter 暴露 `getUsage()`，或配置了 usage endpoint / 当前可用 endpoint 环境变量时才发布 `true`；未配置 Provider 明确发布 `false`。
- `ProviderCatalog` 复用同一能力推导，避免 handshake 与 catalog refresh 返回不一致的 capability。
- App `AgentBridgeProviderOption` 增加 `supportsProviderUsage` 和 `providerUsageCapabilityKnown`；新字段缺失时使用旧全局 feature 行为，显式 false 时隐藏 Provider usage 区域。
- App parser smoke 覆盖显式 true、显式 false 和旧 Bridge 缺字段三种结果；Provider runtime smoke 覆盖 adapter、endpoint 和未配置三种 descriptor。

## 验证

本阶段实际通过：

- `node --check src/provider-registry.js`
- `node --check src/provider-catalog.js`
- `node --check scripts/check-provider-runtime-capability-smoke.js`
- `node scripts/check-provider-runtime-capability-smoke.js`
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`
- `git diff --check`

结果：Bridge 全量 check 退出码 0；SDK 23 HAP 构建退出码 0，产物
`entry/build/default/outputs/default/entry-default-signed.hap`，大小 `14,304,860` bytes，SHA-256
`0CF840745E07C4AB3E67945F6EB69CC7945B5883A6022DFB91EC662F719E3E90`。

指定设备安装：先执行 `hdc list targets -v`，`5KLBB25A10203862` 为 `Connected`；随后仅向该 target
执行一次 `install -r`，HDC 返回 `9568423`（当前签名 profile 未授权设备 UDID）。未启动应用、未读取日志、未截图、
未执行设备端测试，也未向其他设备安装。

真实 Provider quota、凭证、长会话 compaction、真机展示仍属于第 22/34 项 FIELD 验收门；设备安装需使用包含
`5KLBB25A10203862` 的签名 profile 重新签名后重试。

## 兼容边界

`capabilities.providerUsage` 是可选 descriptor 字段，不改变 `provider.usage.list` RPC。旧 Bridge 或旧 App 缺少字段时不阻断既有功能；新 Bridge 对明确不支持的 Provider 返回 capability unavailable，并在 App 隐藏刷新入口。
