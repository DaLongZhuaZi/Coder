# Agent 交接 Prompt：NGFCoder Agent-Bridge 对齐目标收尾

> 本文件由上一执行 Agent 生成（R181-R182 完成后），用于把完整任务状态、文件、证据、环境事实交给下一个 Agent 继续执行。请从头到尾完整阅读后再动手。

---

## 一、任务背景与目标

仓库：`F:\DevEcoStudioProject\Coder`（HarmonyOS Next + ArkTS，bundleName `com.dlzz.coder`，项目名 **NGFCoder**，不是框架-only 工程；AGENTS.md 中 bundleName/定位描述有历史偏差，以实际代码为准）。
任务：持续推进 `docs/agent-bridge-paseo-alignment.md` 中所有仍为「部分实现」的能力项收口，每项必须完成 协议/Bridge/CLI/MCP/App/兼容性/定向 smoke/文档/必要 SDK 23 构建 闭环，只依据**当前源码、当前自动化、本次真实构建证据**（命令、退出码、HAP 大小/SHA-256）逐条证明；**无法本地替代的验证明确保留为 FIELD/现场验收，绝不伪造**。

上一目标（goal-f316943e-2345-4781-8d7b-db6d225950a6）已由原 Agent 标记 complete（revision 7）。新 Agent 如需继续同一目标，用 `get_goal` 读回并用 `update_goal` 的 resume 重新武装；或直接按本 Prompt 继续执行（本 Prompt 即完整任务说明）。

---

## 二、当前进度总览（R155→R182，全部已闭环并留档）

| 对齐表项 | 状态 | 本地已闭环证据 | 剩余（FIELD，不可本地伪造） |
|---|---|---|---|
| 14 Daemon Fleet App | 部分实现 | R156 App-local availability、R180 真机 Fleet 面板（实例/健康/滚动操作/计划状态）、R91/R107 HAP | 多 Bridge rolling、自启重启真机 |
| 16 安全加固 | 部分实现 | R127 fail-closed、R161-163 真实 Chrome 全 action + preview/confirm + 权限 allowlist + 下载脱敏、R181 App 真机权限/下载/fail-closed | 受支持平台 host（browserPlatformHost）、真实恶意页面/登录态 |
| 21/33 Voice | 部分实现 | R155 AVPlayer 状态机、R153/R130/R37-39、R180 真机 capability 矩阵 fail-closed 消费 | 真机录音/播放（用户已指示**跳过**语音部分） |
| 22/34 用量/诊断 | 部分实现 | R169 usage 生产链、R176-178 Web Usage/Metadata/Queue 面板、R182 **App 用量面板真机真实数据**、R180 App 诊断导出 | 真实 Provider quota（本机有 codex app-server 进程可尝试，见 §八） |
| 23B Web UI | 部分实现 | R169-R179 全工作台（composer/terminal/git/files/browser/queue/metadata/usage/multitab）、R182 刷新风暴治理 | 旧 Bridge live |
| 23D Browser | 部分实现 | R161-163 真实 Chrome 全 action、R173 CDP host 重连、R181 App 真机面板（host/instance/page/permission/download + 截图写路径） | 平台 host、真实上传/下载落盘 |

**结论**：本地可验证项已全部闭环；对齐表行仍标「部分实现」仅为 FIELD 余项。新 Agent 的合理工作是：维护回归、按需补强、处理新发现缺陷、以及在有真实资源时推进 FIELD 项。

---

## 三、环境事实（本机已实测）

- SDK：`DEVECO_SDK_HOME='F:\DevEco Studio\sdk'`；Hvigor：`F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat`；targetSdk/compatibleSdk `6.1.0(23)`。
- 构建命令（仓库根目录执行）：`$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`，产物 `entry/build/default/outputs/default/entry-default-signed.hap`。
- 设备：`192.168.5.124:44879`（ADA-AL00U，nova 12 Ultra，API 23，签名 profile 已授权）。另有 `192.168.5.133:45069` 未知 target（勿用）。hdc：`F:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe`。
- 安装/启动：`hdc -t 192.168.5.124:44879 install -r <hap>`；`hdc -t 192.168.5.124:44879 shell aa start -b com.dlzz.coder -a EntryAbility`。
- Bridge 运行环境变量：`AGENT_BRIDGE_HOST=0.0.0.0 AGENT_BRIDGE_PORT=8788 AGENT_BRIDGE_TOKEN=123456 AGENT_BRIDGE_CODEX_RUNTIME=exec AGENT_BRIDGE_MOCK_USAGE_EVENTS=1 AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty`，启动 `node src/server.js`（工作目录 `tools/agent-bridge`）。
- CDP host：`node src/browser-cdp-host.js --bridge-url http://127.0.0.1:8788 --cdp-url http://127.0.0.1:9224 --host-id chrome-cdp-field --workspace-ids wks_zaj5-VK2zd3LSfbb`（真实 Chrome 151.0.7922.138 @9224，profile `.local-rules/chrome-cdp-profile`）。
- Bridge HTTP RPC：`POST http://127.0.0.1:8788/rpc`，Header `Authorization: Bearer 123456`，Body 顶层 `type` 直接是请求类型（如 `agent.list`），非 `"request"`。
- 全量回归：`$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check` 与 `npm run postcheck`（工作目录 `tools/agent-bridge`；postcheck 含 R172/R173/R182 等定向 smoke）。
- 设备自动化：`uitest dumpLayout -b com.dlzz.coder -i`（JSON 存 /data/local/tmp/layout_*.json，用 `hdc shell cat` 取回）；`uitest uiInput click/swipe/dircFling/keyEvent`（坐标=屏幕 px）；`snapshot_display -f` + `file recv` 截图；`hilog -x --pid <pid>` 看 App 日志（pid 每次启动不同，用 `pidof com.dlzz.coder` 取）。
- 布局解析辅助：`.local-rules/layout-texts.py <json> [out.txt]`（文本+bounds，可带 UTF-8 输出文件）、`layout-buttons.py`、`layout-clickable.py`（可点击节点）。Python 输出经控制台会 GBK 乱码——**写 UTF-8 文件后用量读工具读**。

---

## 四、已修改/新增文件清单（含备份，勿破坏）

### App（ArkTS）
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`：
  - R181：`browserWorkspaceId()` 优先取 `currentBridgeAgentRecord().workspaceId` → `findBridgeWorkspaceRecordForLocalWorkspace(currentWorkspace()).workspaceId` → 回退本地 id（备份 `.bak-r181`）。
  - R182：`executeRegisteredCommand` FOCUS_RIGHT_PANE 非 EXPANDED 改 `openSheet(AgentHomeSheetKey.SESSION_DETAILS)`；`pushPaneCommandDefinitions` 该命令 enabled 恒 true（备份 `.bak-r182`，含 R181 修复）。
- 备份：`.bak-r161`、`.bak-r181`、`.bak-r182`（同目录）。

### Bridge（Node）
- `tools/agent-bridge/src/server.js`：R182 `ensureProviderSessionForAgent` 早退分支再水合（provider 可选 `ensureSession` 契约）；`agent.attach` 无条件 ensure；`message.send`/`session.messages` 未命中时按 `agentManager.findBySessionId` 查找 agent 并 ensure 重试（备份 `.bak-r182`）。
- `tools/agent-bridge/src/providers/mock-provider.js`：R182 新增幂等 `ensureSession(payload)`（按持久化 id 重建会话），`createSession` 复用（备份 `.bak-r182`）。
- `tools/agent-bridge/src/workspace-service.js`：R179 `buildUntrackedFileMap` 批量 git 枚举（`.bak-r179`）；R179b changes 缓存（`.bak-r179b`）。
- `tools/agent-bridge/src/provider-registry.js`：R179b missingSessionCooldownMs 300000（`.bak-r179b`）。
- `tools/agent-bridge/src/providers/codex-app-server-provider.js`：R179b CODEX_THREAD_LIST_CACHE_MS 30000（`.bak-r179b`）。
- `tools/agent-bridge/src/agent-manager.js`：R172 message/text 别名（`.bak-r172`）。
- `tools/agent-bridge/src/browser-cdp-host.js`：R173 自管重连+新 nonce（`.bak-r173`）。

### Web UI
- `tools/agent-bridge/src/web/app.js`：R174 New Agent 对话框、R176 hello hostProfileId、R182 刷新风暴治理（`setRefreshTimer` 加 `document.hidden` 跳过；`refreshSessionInternal` 加 `sessionMessagesStaleFor` 停止轮询失效会话；state 加字段）（`.bak-r174`、`.bak-r182`）。
- `tools/agent-bridge/src/web/index.html`：R174 new-agent-dialog（`.bak-r174`）。

### 契约/定向 smoke（全部接入 postcheck）
- `scripts/check-message-send-text-alias-smoke.js`（check:r172）、`check-cdp-host-reconnect-nonce-smoke.js`（check:r173）、`check-web-ui-contract-smoke.js`（R174/R176/R182 断言）、`check-session-rehydrate-smoke.js`（**新**，check:r182：创建会话→发消息→重启 Bridge→agent 记录存活且 send/messages 再水合成功）。
- `package.json`：新增 `check:r182`，postcheck 尾部追加 `&& npm run check:r182`。

### 文档（每轮一份）
- `docs/agent-bridge-paseo-alignment.md`：表头最新证据链（R182 在最前）+ 各行证据列。
- `docs/agent-bridge-r180-device-app-panels-field-progress.md`、`r181-device-browser-panel-fix.md`、`r182-usage-entry-rehydration-storm-fixes.md`（最近三轮）。
- `.local-rules/device-field-test-progress.md`：运行日志（R161→R182）。
- `.local-rules/build-commands.local.md`：每次 HAP 构建记录（最新 R182：14,558,715 bytes，SHA-256 `F8199859581F45A2CCC50B785361CD3FBEA76271B3EC5A59BE126B92E42E3FEC`）。
- 本文件：`docs/agent-bridge-handoff-prompt.md`。

### 最近构建证据（真实）
- R181 HAP：14,558,784 bytes，SHA-256 `D916C77E7A339CCB582CA3A2242AEFBD02A784F3A2E7CF9B9927D9D47A683775`。
- R182 HAP：14,558,715 bytes，SHA-256 `F8199859581F45A2CCC50B785361CD3FBEA76271B3EC5A59BE126B92E42E3FEC`（已装机）。
- Bridge 全量：`npm run check` CHECK_EXIT=0 + `npm run postcheck` POSTCHECK_EXIT=0（R182 后）。

---

## 五、关键缺陷历史与修复（防回退）

1. **Bridge 事件循环停摆**（多轮）：根因① R179 前 workspace.changes.get 对每个 untracked 逐个 git 子进程（~380 个）→ 修复为批量枚举+缓存（TTL 4s+写操作清缓存）；根因② R182 5 个旧 Web 标签 15s 全量刷新（4.1s git 枚举×5 + 失效会话轮询触发 provider 发现）→ App 侧修复 document.hidden 跳过 + sessionMessagesStaleFor，现场关闭旧标签后 CPU 从 100% 立即归零。**若再遇 CPU 100%/health 超时：先查 node 进程 CPU、Web 标签数量（CDP /json 列出）、git 子进程数。**
2. **Bridge 重启后会话丢失**（R182 根因）：mock provider 会话纯内存，agent 记录持久化；已加 ensureSession 再水合。**若再遇重启后 message.send session_not_found，检查 ensure 路径是否被绕过。**
3. **App 浏览器面板空**（R181 根因）：browserWorkspaceId 必须返回 Bridge 纯 id。
4. **Web Usage 空**（R176）：hello 必须带 hostProfileId。
5. **CDP host nonce_replay**（R173）：重连必须新 appNonce。

---

## 六、已知坑（真机自动化）

- 设备会**再次自动锁屏**（~30min 无操作），需用户手动解锁；锁屏后 dumpLayout 返回 `[]`。
- `keyEvent Back` 在 App 内会退出到桌面（再 `aa start` 拉回）；在弹出层/键盘打开时按 Back 一般先收键盘/关层。
- 设置页/详情 sheet 滚动位置**跨打开持久化**；dump 坐标是**滚动容器内容坐标**，y 可远超 2776——按 dump 直接点击屏幕外坐标会落空/误触，必须先用慢速拖拽（velocity 200，快 fling 回弹）把目标滚进视口再按新 dump 坐标点。
- 输入框实际点击区（bounds）比视觉框大（y 延伸 ~120px），状态条/进度条区域可能被输入框/发送键覆盖导致点击无效（R181 结论：状态条整行点击不可达，入口走命令面板）。
- 命令面板搜索框查询在关闭时重置；再次输入前若已有残留文本需先关闭重开。
- `hilog -x` 缓冲轮转快（用量事件多），需要时及时抓取。

---

## 七、下一步建议（按优先级）

1. **重启现场环境**（当前已按用户要求全部关闭）：后台启动 Bridge（env 见 §三）+ CDP host + 确认 /health 快、Chrome 9224 存活、App 重连。
2. **回归维护**：任何源码改动后跑 `npm run check`+postcheck（system-conpty）+ 必要 SDK 23 构建；文档同步（对齐表头+行证据+field log+build facts）。
3. **可推进的本地项**：
   - 用本机真实 codex app-server（进程 pid 38968，`F:\npm-global\node_modules\@openai\codex\bin\codex.js app-server`，未接入 Bridge provider）做**真实 Provider 用量/元数据 FIELD 预演**（check:codex-real 脚本存在：`scripts/check-codex-app-server-real-smoke.js`）——注意这是用户侧进程，接入前需确认归属。
   - 旧 Bridge live（可临时用 git 历史版本跑一个测试实例做协议兼容对照）。
4. **FIELD 项**（需真实资源，不可伪造）：真实 GitHub OAuth/PR、多 Bridge rolling、平台 host（browserPlatformHost）、真实恶意页面/登录态、真机语音录音/播放（用户已指示跳过）、自启重启真机验收。

---

## 八、规则与约束（必须遵守）

- 根目录 `AGENTS.md` + `.rules/` 技能库（命中即读，如 skill-arkts-standards、skill-device-hdc-debug、skill-local-rules）+ `.local-rules/*.local.md`（本机事实以实测为准）。
- 高风险的 ArkTS/JS 修改先做同目录 `.bak-r<轮次>` 备份；修复保持原功能等价。
- 中文输出；文件统一 UTF-8；日志用 `import { logger } from 'ngf_framework'`。
- 只依据当前源码+当前自动化+本次真实构建证据（命令、退出码、HAP 大小/SHA-256）逐条证明；FIELD 项明确标注不伪造。
- 用户指令优先于本文件与规则文件。

---
*生成于 2026-08-16，R182 完成、Bridge 进程已按用户要求全部关闭之后。*
