# R181：App 端浏览器自动化 workspaceId 映射缺陷修复 + 真机面板现场闭环（第 16/23D 项）

日期：2026-08-16
状态：已实测（真机 ADA-AL00U + Bridge 0.1.4 + SDK 23 HAP + 布局/hilog/截图三重证据）

## 1. 缺陷根因

- R180 现场观察到 App 浏览器面板 fail-closed「当前工作区没有兼容的浏览器主机」且 hilog 中 browser RPC 被 `browser_workspace_required` 拒绝（`app_req_449`）。
- 根因：`NGFAgentHomePage.browserWorkspaceId()` 只返回 App 本地复合 workspaceId（`host_<host>_::v2_workspace_..._wks_zaj5-VK2zd3LSfbb`），而 Bridge 的 workspace registry 只认纯 id `wks_zaj5-VK2zd3LSfbb`（与 Web UI 一致）。App 所有 browser RPC（host.list/permission.get/instance.list/page.list/download.list/动作）因此被 workspace scope 校验拒绝。
- 该缺陷自 R36 面板接线起一直存在，R180 之前设备锁屏无法验证，从未在真机暴露。

## 2. 修复（ArkTS）

- 文件：`entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`（备份 `.bak-r181`）
- `browserWorkspaceId()` 取值顺序改为：
  1. `currentBridgeAgentRecord().workspaceId`（Bridge 权威纯 id，agent record 来自 agent.list）
  2. `findBridgeWorkspaceRecordForLocalWorkspace(currentWorkspace()).workspaceId`（workspace registry 映射）
  3. 回退 `activeWorkspaceId` / `workspaceIdForPath(currentWorkspacePath())`（本地复合 id，仅兜底）
- 该方法同时用于全部 RPC 载荷与响应/事件 scope 比对（`applyBrowserPermissionState`、`browserEventScopeCoordinator.accepts`），单一修复贯通全部浏览器链路。
- `git diff --check` 退出码 0。

## 3. SDK 23 构建与安装（本轮真实构建证据）

- 命令：`$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`
- 结果：退出码 0（后台 job pwsh-127），产物 `entry/build/default/outputs/default/entry-default-signed.hap`：
  - 大小 14,558,784 bytes，生成时间 2026-08-16 14:29:20
  - SHA-256 `D916C77E7A339CCB582CA3A2242AEFBD02A784F3A2E7CF9B9927D9D47A683775`
- 安装：`hdc -t 192.168.5.124:44879 install -r` → `install bundle successfully`；`aa start` → `start ability successfully`，pid 52532。
- 环境事实：Bridge 运行中（0.0.0.0:8788，uptime 6220s+，activeConnections 5）；CDP host `chrome-cdp-field` 注册于 `wks_zaj5-VK2zd3LSfbb`；真实 Chrome 151.0.7922.138 @127.0.0.1:9224；设备在验证中途再次自动锁屏，用户再次解锁后继续。

## 4. 真机验证证据（布局 + hilog + 截图）

导航：主页 → 右上菜单 → 连接设置 → 工作区 tab → 浏览器自动化面板（滚动容器内容坐标需慢速拖拽 velocity 200，快速 fling 回弹）。

- **browser.host.list**（app_req_308，14:45:51）：`ok:true hosts:[{hostId:"chrome-cdp-field", label:"Chromium CDP", platform:"win32-cdp", hostKind:"cdp", runtime:"chromium", capabilitySource:"cdp", readiness:"ready", supportedPlatforms:["win32"], capabilityWarnings:[], supportedCommands:[instance.list/instance.create/instance.close/page.list/page.create/page.close/page.navigate/...]}]` —— 此前 fail-closed 空列表 → 真实主机可见。
- **browser.permission.get**（app_req_309）：`ok:true workspaceId:"wks_zaj5-VK2zd3LSfbb" domains:["127.0.0.1"] permission:{...} downloadDirectoryConfigured:true downloadDirectory:".agent-bridge-downloads" updatedAt:"2026-08-15T20:05:18.301Z"` —— 纯 workspaceId + 权威域名 allowlist + 受管下载目录状态（第 16 项安全边界在 App 端消费）。
- **browser.instance.list**（app_req_311）：`ok:true instances:[{instanceId:"chrome-cdp-field", name:"Chromium CDP", engine:"chromium-cdp", connected:true}]`。
- **browser.page.list**（app_req_312）：`ok:true pages:[R163 Field Test Page (http://127.0.0.1:9333/r163-test-page.html), NGF Agent Bridge (http://127.0.0.1:8788/) ×5, Example Domain (https://example.com/), about:blank]` 8 个真实页面。
- **browser.download.list**（app_req_313）：`ok:true downloads:[] tracking:"cdp-events"`。
- **App UI 写路径动作**：页面行「截图」按钮 → `browser.page.screenshot`（app_req_320，14:48:20）：`ok:true commandId:"browser_2M5MddP3TtBPpzx0" hostId:"chrome-cdp-field" screenshot:{mimeType:"image/png", dataBase64:"iVBORw0KGgoAAAANSUhEUgAAAvYAAAHiCAIAAAAMLB9n..."}` —— 真实 Chrome 页面 PNG 经 Bridge 返回真机 App。
- **fail-closed 错误展示**：无选中页面时执行操作 → 面板红框「浏览器操作失败。请刷新主机状态后重试。」正常渲染。
- **App 面板渲染**：主机卡 Chromium CDP / win32-cdp / `cdp · chromium · cdp · ready · win32`、实例卡 chromium-cdp + 关闭实例、8 页面行（截图/关闭页面按钮）、域名权限 127.0.0.1、下载目录状态、更新时间、导航/等待/页面操作/@e1/@e2/evaluate/上传限制/点击·填充·输入·按键·悬停·选择 动作按钮、「执行操作」按钮、截图预览区、自动化与协作面板。
- 屏幕证据：`.local-rules/screen-r181e.jpeg`（面板全貌）、`.local-rules/screen-r181f.jpeg`（动作区+错误提示+自动化与协作）。

## 5. 结论

- 第 23D 项 App 侧现场闭环：真机上 host/instance/page/permission/download 五路只读 + page.screenshot 写路径全部 ok:true 并渲染真实数据；此前唯一缺口（App→Bridge workspaceId 映射）已修复并被本轮构建与真机证据证明。
- 第 16 项 App 侧安全边界现场：域名 allowlist、受管下载目录状态、action 失败 fail-closed 在真机 App 消费。
- 仍待 FIELD：受支持平台 host（browserPlatformHost）、真实恶意页面/登录态、真实上传下载文件落盘、多 Bridge rolling。

## 5.5 附带发现：App 端「会话数据/用量」面板入口在真机竖屏受阻（第 22 项待跟进）

- 本轮顺带尝试真机打开会话详情（用量汇总/Provider 用量所在 sheet，`buildSessionDetailsSheet`），发现两个入口在竖屏下均不可达：
  1. **底部状态条**（`buildComposerStatusStrip`，onClick → SESSION_DETAILS）：布局实测输入框 `agent_home_composer` 实际 bounds 延伸到 y2625、发送按钮到 y2618，覆盖状态条 [60,2571][1164,2684] 的上半；仅剩的 y2625-2684 细条带（含进度条）在四个位置（600,2655 / 1140,2660 / 100,2660 / 1000,2615）点击均无响应（疑被手势导航区或透明层吞掉）。
  2. **命令面板「会话数据」命令**（Alt+3 / FOCUS_RIGHT_PANE）：注册条件 `workbenchMode === EXPANDED`，竖屏窄布局下禁用。
- 影响：第 22 项 App 端用量展示面板在真机竖屏缺可点击入口（代码与 HAP 构建已闭环，Web 端 R176/R169 现场已闭环）。建议后续将 SESSION_DETAILS 入口上移或让状态条点击区避开输入框扩展区；本轮不阻塞 16/23D 的闭环结论。

## 6. 附注

- 本轮仅改 ArkTS（App），Bridge/CLI/MCP/Web 未改动，无需 Bridge 回归；`git diff --check` 退出码 0。
- 自动化注意点（沿用 R180）：设置页深滚动持久化；内容坐标 ≠ 屏幕坐标（屏幕外节点 dump 仍带内容坐标，直接按 dump y 点击会落空/误触）；快速 fling 回弹；设备会再次自动锁屏。
