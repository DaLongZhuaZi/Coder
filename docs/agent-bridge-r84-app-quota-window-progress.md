# R84 App quota window compatibility

## Scope

修正 Provider quota 自定义窗口从 Bridge 到 App parser 和 Usage 展示的闭环。Usage summary、budget 和查询窗口仍只接受 session、day、month；只有 quota snapshot 保留经过安全校验的 Provider 自定义窗口。

## Progress

- [x] AgentBridgeIncomingParser.parseUsageQuotas() 使用独立 quota window 归一化。
- [x] 保留 hour、rolling-7d 等安全 Provider 窗口。
- [x] 拒绝空值、控制字符、Unicode 行分隔符、路径分隔符、. / .. 和超过 64 个字符的窗口名。
- [x] Agent Home 对未知但安全的 quota 窗口显示原始窗口名，不再错误显示为 session。
- [x] M5 parser 增加安全自定义窗口与恶意/超长窗口断言。
- [x] 本轮执行 Bridge 全量 check，主检查链、postcheck（含 R82/R83）均退出码 0。
- [x] 本轮执行 SDK 23 assembleHap --no-daemon --stacktrace，BUILD SUCCESSFUL；HAP 大小 14,389,096 bytes，SHA-256 为 B8452ACCE84DF27E0B9E7D35F852FDF93A04D158C15209C9742654060DA0591E。
- [x] 本轮执行 git diff --check，无实际空白错误；仅有既有 LF/CRLF 转换提示。

## Evidence rule

只有本轮实际执行的命令和退出结果可写为通过。Node Bridge 回归不替代真实 Provider quota、长会话和真机 Usage/Diagnostics 现场验收；本轮没有执行设备安装，重大 App 包更新仍只允许安装到 5KLBB25A10203862，且只安装不启动、不测试。
