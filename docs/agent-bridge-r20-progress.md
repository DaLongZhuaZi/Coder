# R20 Browser Action Preview Snapshot 进度

更新时间：2026-08-08

## 目标

确保 HarmonyOS App Browser action 的 Preview -> Confirm 使用同一份强类型目标快照，
不因确认对话框期间的页面选择、动作参数或上传文件输入变化而重建另一份请求。
Bridge 仍以一次性 plan digest、workspace scope、host/instance/page 和文件摘要作为
最终执行门禁。

## 已完成的源码工作

- `NGFAgentHomePage` 新增 `pendingBrowserActionPayload`，Preview 发出前保存完整
  `AgentBridgeBrowserPayload`，包括 workspace/Agent/host/instance/page、action、元素
  refs、输入内容、脚本、滚动参数、下载/上传文件和其他边界字段。
- Confirm 不再读取当前 UI draft；使用预览时的 payload 快照显式复制字段，只替换一次性
  `planId` 并设置 `confirm=true`。取消、断开、host 切换和页面清理会清除快照。
- 上传路径继续在 Preview 时执行 workspace-relative 校验；Bridge confirm 仍重新做
  realpath、workspace ownership、大小、mtime 和 SHA-256 检查。
- 协议对齐 smoke 增加 App action 快照/确认复用断言，防止后续回归为“确认时重新拼装”。

## 本轮实际验证

| 验证 | 命令 | 结果 |
|---|---|---|
| Protocol alignment | `node --check tools/agent-bridge/scripts/check-protocol-alignment-smoke.js; node tools/agent-bridge/scripts/check-protocol-alignment-smoke.js` | 退出码 0，`protocol alignment smoke ok` |
| Target guard 回归 | `node --check tools/agent-bridge/src/daemon-target-guard.js; node tools/agent-bridge/scripts/check-daemon-target-guard-smoke.js` | 退出码 0 |
| Bridge 全量检查 | `npm --prefix tools/agent-bridge run check` | 退出码 0；含新增 protocol alignment 断言与 postcheck |
| SDK 23 HAP | `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace` | 退出码 0，`BUILD SUCCESSFUL in 36 s 168 ms`；仅既有 syscap/弃用/异常声明警告 |
| 工作区格式检查 | `git diff --check` | 无 diff 错误；仅既有 LF/CRLF 提示 |

HAP 产物：`entry/build/default/outputs/default/entry-default-signed.hap`，本轮时间
为 2026-08-08 20:21:39，大小 14,207,075 bytes，SHA-256
`50A3C4FFC5CA23C74D05709D48D53241E577EE229036D08F3780CA1718C7661A`。

本轮没有重复设备安装：上一轮已明确仅向 `5KLBB25A10203862` 尝试安装并因签名
profile 未授权 UDID 返回 `9568423`；本轮没有向任何设备安装、启动或测试。

## 尚未关闭的现场门

- 至少一个真实 desktop/platform Browser host 的全量控制链。
- HarmonyOS host 只按官方 API 真实 capability 注册或准确降级。
- 真实登录态、恶意页面、跨域、上传/下载、host 断线和清理现场。

因此第 16、23D 继续保持“部分实现”，R20 仅关闭 App Preview/Confirm 目标快照源码子阶段。

## 下一步

优先为 HarmonyOS/平台 Browser host 做官方 API 能力核查与最小 host adapter 设计；若
平台能力不足则补充准确 unavailable/capability 证据，不声明虚假 host。现场依赖仍与
第 22/34 Provider 生产链并行记录。
