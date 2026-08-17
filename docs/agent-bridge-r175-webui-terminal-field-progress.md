# R175：Web UI Terminal 面板现场验证（第 23B 项）+ 环境治理

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4 + system-conpty 后端）

## 1. Web UI Terminal 面板现场（第 23B 项）

真实 Chrome 中完整走通 Web 工作台 Terminal 控制面：

- 选择 agent（wks_zaj5 / F:\DevEcoStudioProject\Coder）→ 点击 New（terminal-create-button）→ 终端列表出现 `Web Terminal · running`。
- 点击终端项（Open 按钮）→ 选中并订阅 → **terminal-output 渲染真实 shell 输出**：`Microsoft Windows [版本 10.0.26100.3476]` + `(c) Microsoft Corporation。保留所有权利。` + 提示符 `F:\DevEcoStudioProject\Coder>`（cmd.exe + system-conpty，二进制帧流 → 文本输出端到端）。
- 通过 Web UI 输入框提交命令 → shell 回显 `echo WEBUI-TERMINAL-OK`（输入经 INPUT 帧到达 pty，本地回显证明输入链真实；Enter 由用户按键触发，自动化中需显式携带换行）。
- Bridge 侧复核：`terminal.create`/`terminal.capture`（captureBytes 190→232 持续增长）/agent-scoped `terminal.list` 均正常，status=running，backend=system-conpty。

## 2. 终端列表 agent 作用域语义（非缺陷）

排查中发现 `terminal.list` 对带 ownerAgentId 的终端只对携带相同 agentId 的请求可见（未携带 agentId 的裸请求返回空）。这是**设计语义**（agent 归属终端仅对其作用域可见；Web UI 总是携带 agentId，因此正常）；非缺陷。附带确认：终端创建后即使进程退出也会保留 closed 状态记录，不会从列表消失。

## 3. 环境治理：R174 测试遗留错误 workspace 清理

- R174 的 New Agent 对话框现场测试因脚本转义问题产生了错误 agent（rootPath `F:\DevEcoStudioProject\Coder\tools\agent-bridge\DevEcoStudioProjectCoder`——drive-relative 路径被 mock 解析到错误目录）。该 agent 被 Web UI 标签每 15s 刷新（git/files/changes 对不存在路径的调用）与 codex exec discovery 共同造成**间歇性事件循环 stall**（health 12s 超时、WS 握手超时）。
- 已删除该 agent（agent.delete，agent.list 8→7 全部为正确路径），重启 Bridge 后健康恢复（uptime 367s+，conns 5）。
- 备注：codex exec 第三方 provider 的 discovery 慢（15-30s）仍是已知环境限制（R168 冷却已缓解触发频率），FIELD。

## 4. 附注

- Bridge 本次以 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty` 运行（与全量回归一致的后端）。
- 本轮未修改源码、未修改 ArkTS/HAP；纯现场验证轮。测试终端已 kill。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling、codex exec discovery 性能。