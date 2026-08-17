# Agent Bridge R8 Browser App 异步状态收口进度

更新时间：2026-08-08

## 目标

在 R7 Bridge/CDP 与 Web 控制面源码闭环之上，收口 HarmonyOS App Browser 基础控制面的异步响应关联、截图预览和生命周期清理。R8 不把 App 基础入口扩大解释为完整 Browser host，也不关闭第 16、23B、23D 的现场验收门。

## 本轮源码变更

- `AgentBridgeBrowserResult` 增加可选 `requestId`，parser 优先读取响应 envelope 的 `id`，缺失时兼容 payload 内的 `requestId`。
- `NGFAgentHomePage` 为 Browser RPC 建立强类型 pending request 记录，按 request ID 处理乱序响应；旧 Bridge 只有单个在途请求且缺少 ID 时保留兼容路径，多请求缺 ID 的响应会被丢弃。
- 空 request ID 不会清除其他在途请求；关闭实例/页面的确认预览会捕获预览时的 host、instance、page、agent 和 workspace 目标，避免并发刷新后误操作当前选中对象。
- 主机切换、Bridge 断开、页面销毁和会话窗口释放会清空 Browser pending 请求及截图预览，避免旧 host 的迟到响应更新当前 UI。
- App 截图预览只接受 `image/png`、`image/jpeg`、`image/webp`，限制 Base64 载荷为 8 MiB；不支持 MIME、空数据或超限数据会清除预览，不把原始截图写入日志或诊断。
- Browser 设置区新增受限截图预览入口，继续沿用现有 capability gate 和 host/page scope。
- `AgentBridgeBrowserParser.test.ets` 增加 envelope/payload request ID 与安全默认值断言。

## 本次真实验证

工作区：`F:\DevEcoStudioProject\Coder`

| 验证 | 结果 |
|---|---|
| `npm run check:browser` | 通过 |
| `npm run check` | 通过，退出码 0 |
| SDK 23 `assembleHap --no-daemon --stacktrace` | `BUILD SUCCESSFUL`；仅保留既有资源重名、syscap 与异常声明警告 |
| 产物 | `entry/build/default/outputs/default/entry-default-signed.hap` |
| 指定设备安装 | 仅尝试 `5KLBB25A10203862`；HDC 错误码 `9568423`，当前签名 profile 未授权该设备 UDID |
| 设备启动/测试 | 未执行 |

设备安装失败不改变源码验证结果；后续如需安装，必须先使用包含 `5KLBB25A10203862` UDID 的签名 profile 重新签名，且只执行该设备的安装命令。

## 剩余现场门

- R6-WEB-3：真实双标签、旧 Bridge、长 terminal binary 流和刷新恢复。
- R7-HOST：至少一个真实 desktop/platform Browser host、真实上传下载、恶意页面/登录态与 host 清理。
- HarmonyOS App：Browser 全量动作工作台、真机网络/窗口/权限行为仍需现场验证。
- 第 16、23B、23D 继续保持“部分实现”；R8 只补 App 请求生命周期和安全截图预览，不替代现场证据。
