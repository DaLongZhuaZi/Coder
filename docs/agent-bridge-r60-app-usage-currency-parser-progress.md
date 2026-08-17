# R60 App usage currency parser integrity

更新时间：2026-08-09

## 目标

让 App parser 与 Bridge 的费用币种语义一致：缺少币种的费用不得进入可展示的费用列表，合法币种统一为大写，旧 Bridge 缺少字段时继续显示 unavailable。

## 实施范围

- `AgentBridgeIncomingParser.parseUsageCosts()` 拒绝空/缺失 `currency` 的 cost，即使金额存在也不把它当作可用费用。
- usage event、budget 和 budget warning parser 对可选币种执行 trim 与大写规范化。
- 保持 token/quota/compaction 缺失数值的 `-1` unavailable 默认值，不改变既有 RPC 字段。
- `AgentBridgeM5Parser` 增加空币种、空白币种、小写币种和预算币种覆盖；既有 M5 parser suite 已通过 `List.test.ets` 注册。

## 验证

本阶段实际通过：

- SDK 23 `assembleHap --no-daemon --stacktrace`：`BUILD SUCCESSFUL in 44 s 328 ms`
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`
- HAP SHA-256：`E617B8A8289F177AFF0A1421FA9D4DE00D98E352331EB9B3AC01FEC845B61E1D`
- Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0（R59 已纳入 postcheck）
- `git diff --check`：退出码 0，仅仓库既有换行提示

## 设备边界

本阶段未启动、未读取日志、未截图、未测试或安装任何设备。若后续需要安装本 HAP，只允许使用 `5KLBB25A10203862`，不得触碰其他设备。

## 边界

真实 Provider 账单币种、quota、长会话 compaction、真机 Usage/Diagnostics 展示仍属于清单第 22、34 项 FIELD 验收门。
