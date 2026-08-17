# R69 Browser permission state 与下载目录状态

更新时间：2026-08-09

## 目标

收口清单第 16、23D 的 HarmonyOS App Browser 权限状态可见性子阶段。目标是让 Bridge 的 workspace/domain permission 状态以脱敏 DTO 进入 App，并在 host/workspace 生命周期变化时正确清理；本阶段不宣称已经具备真实平台 Browser host、真实上传下载或真机全量动作能力。

## 任务进度

| 任务 | 状态 | 证据 |
|---|---|---|
| Bridge permission DTO 与事件 | 已完成（源码子阶段） | `BrowserAutomationManager.publicPermissionState()` 统一输出 workspaceId、domains、downloadDirectoryConfigured、updatedAt；`browser.permission.updated` 复用该 DTO；公开响应保留旧扁平字段以兼容旧客户端 |
| App parser 与状态模型 | 已完成（源码子阶段） | `AgentBridgeBrowserPermissionState`、`AgentBridgeBrowserResult.permission` 和 `downloadDirectoryConfigured` 已增加；parser 支持嵌套 DTO、旧字段和缺字段安全默认值 |
| App Browser 面板 | 已完成（源码子阶段） | Browser 区域展示 allowlist、下载目录是否受管和更新时间；不展示绝对下载路径；主动查询、事件更新和 host/workspace 切换清理均已接线 |
| 自动化与协议对齐 | 已完成（源码子阶段） | Browser manager smoke、protocol alignment smoke、Bridge 全量 `check` 和 `git diff --check` 通过；App parser 断言已注册到 `List.test.ets` |
| SDK 23 HAP | 已完成（源码子阶段） | `assembleHap --no-daemon --stacktrace` 通过；产物见下方证据 |
| 真机/平台现场 | 待现场验证 | 目标设备 `5KLBB25A10203862` 当前 Offline；本轮未安装、启动、测试或读取日志；受支持平台 host、真实上传下载、恶意页面和登录态仍待 FIELD |

## 实现边界

- Bridge 对外公开的 `permission` 只包含可用于 UI 的 workspace、域名规则、下载目录配置状态和更新时间，不返回绝对下载路径、凭证、内部安全存储或 host 内部状态。
- `downloadDirectory` 旧字段仍保留为兼容字段，但现在只返回固定相对标识 `.agent-bridge-downloads`；App 只消费 `downloadDirectoryConfigured`，因此不会在权限面板中泄露本机路径。
- App 应用 permission 结果前检查当前 workspace；host/workspace 切换、断开或页面释放时清除旧权限快照，迟到事件不能覆盖新 scope。
- 权限变更继续使用 Bridge 现有 preview/confirm plan；R69 只补状态读模型和事件公开边界，不绕过高风险操作确认。

## 本次验证

### 定向 smoke

- `node scripts/check-browser-automation-manager-smoke.js`：退出码 0，输出 `browser automation manager smoke ok`。
- `node scripts/check-protocol-alignment-smoke.js`：退出码 0，输出 `protocol alignment smoke ok`。

### 全量与静态检查

- `npm --prefix tools/agent-bridge run check`：本轮重新执行通过，包含 Bridge 主 check 与 postcheck。
- `git diff --check`：文档与源码差异无空白错误。

### SDK 23 构建

- 命令：`$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`
- 结果：`BUILD SUCCESSFUL`。
- 产物：`entry/build/default/outputs/default/entry-default-signed.hap`。
- 大小：`14,376,618` bytes。
- SHA-256：`10B28A1F2ABC9B5C0DFE8D4EAA0CC0E1230A2D4627C97A5E76ADFA0799BEFBB3`。

### 设备边界

- 查询：`F:\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe list targets -v`。
- `5KLBB25A10203862`：`Offline`，因此未执行 `install`。
- `2UCUT24724009680`：虽然在线，但本轮未使用。
- 未启动 App、未执行设备端测试、未读取设备日志。

## 后续现场门

R69 不改变清单状态：第 16、23D 仍为“部分实现”。关闭前还需要受支持的平台 Browser host、HarmonyOS App 全量动作、真实页面安全行为、登录态隔离、上传/下载和真机现场证据。源码子阶段通过不能替代这些现场门。
