# R126 Browser App event scope 进度

更新时间：2026-08-10

## 本轮问题

Agent Home 之前只按 `browser.updated` 事件名进入处理，未验证 unsolicited lifecycle event 是否属于当前 workspace、已选 host、instance/page 和可见页面生命周期。workspace 切换路径也可能暂时保留旧 Browser 列表、截图、下载和在途请求，造成迟到结果覆盖新 workspace 的可见状态。

## 实施内容

- `AgentBridgeBrowserResult` 新增可选 `eventKind` 和单个 `host` 解析；Browser parser 现在保留 host lifecycle event 的 workspaceIds，兼容旧的 hosts/扁平字段。
- 新增 `AgentHomeBrowserEventScopeCoordinator`：页面不可见时 fail closed；host registered 必须带当前 workspace；permission 和普通事件必须有当前 workspace 证据；host/instance/page 显式 scope 不匹配时丢弃；host unregistered 只接受当前选中 host。
- `NGFAgentHomePage` 在应用 `browser.updated` 前执行统一 scope gate，并在 workspace/host/session 生命周期切换时清理 Browser 请求、列表、选择项、日志、下载和截图。
- `updateActiveWorkspaceId()` 作为运行期 workspace assignment gate，覆盖 workspace activation、删除、QR 导入、远程 session/fork/import 和 workspace migration 路径。
- 新增 `check-browser-app-scope-smoke.js`，并将 `check:r126` 接入 Bridge `postcheck`；Hypium parser/coordinator tests 覆盖可见性、workspace mismatch、host registration/unregistration 和 stale page。

## 修改文件

- `entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets`
- `entry/src/main/ets/features/agentHome/AgentHomeBrowserRequestCoordinator.ets`
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`
- `entry/src/test/AgentBridgeBrowserParser.test.ets`
- `entry/src/test/AgentHomeBrowserRequestCoordinator.test.ets`
- `tools/agent-bridge/scripts/check-browser-app-scope-smoke.js`
- `tools/agent-bridge/package.json`

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r126`：退出码 0，输出 `browser app scope smoke ok`。
- Node syntax 与 `package.json` 解析：通过。
- `git diff --check`：通过；仅保留既有 LF/CRLF 转换提示。
- 本轮未执行 Hvigor/HAP 构建，未安装、启动或测试设备；如后续发生重大 App 功能更新，安装目标仅允许 `5KLBB25A10203862`，且只安装不启动/测试。

## 对齐结论

R126 收口第 16、23D 的 HarmonyOS App Browser event/state scope 源码子阶段。真实平台 Browser host、恶意页面/登录态隔离、上传下载、弱网长流和 HarmonyOS App 全量动作仍待现场验收，第 16、23D 继续保持“部分实现”。
