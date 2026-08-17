# R114 Provider usage details App 闭环

## 范围

本阶段收口 Provider usage 结果中 `details` 附加信息从 Bridge/parser 到 Agent Home 设置区的可见闭环。details 仍是可选字段，旧 Bridge 缺少该字段时保持既有 Provider Usage 页面和 unavailable 语义。

## 实现

- `AgentBridgeProviderUsageDetailRecord` 已由 App parser 读取 `key`、`label`、`value` 和 `status`。
- `NGFAgentHomePage` 的 Provider Usage 区新增强类型 details 列表；详情按现有 session detail row 展示，不直接渲染原始 JSON。
- 空 `label` 回退到安全 `key`，两者都为空时显示本地化 unavailable；详情值继续经过既有安全值解析。
- 新增中英文资源 `agent_home_provider_usage_details`，不硬编码用户文案。
- `AgentBridgeM5Parser.test.ets` 覆盖 details payload 的 key、label 和 value 解析。

## 验证

- `npm run check:r87`：通过。
- `npm run check:r88`：通过。
- `npm run check:r104`：通过。
- `npm --prefix tools/agent-bridge run check`：通过。
- Node syntax、三套 i18n JSON 重复 key/解析检查：通过。
- `git diff --check`：无实际空白错误，仅有既有 LF/CRLF 转换提示。
- SDK 23：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：通过。
- HAP：`F:\\DevEcoStudioProject\\Coder\\entry\\build\\default\\outputs\\default\\entry-default-signed.hap`，14,478,157 bytes，SHA-256 `9FB8DE1EE659964E2B3BE74A10065669AB443C5EA787C19D17B88C6E1CD36982`。
- 未安装、启动或测试设备；指定设备 `5KLBB25A10203862` 未操作。

## 未关闭边界

本阶段只补齐 App 可见 details 字段，不证明真实 Provider 套餐、账单/配额凭证、长会话恢复或真机 Usage/Diagnostics 展示。因此第 22、34 项继续保持“部分实现”。
