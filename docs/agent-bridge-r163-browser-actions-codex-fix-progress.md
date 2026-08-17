# R163：真实 Chrome 全 action 矩阵 + Codex 配置缺陷修复（现场）

日期：2026-08-16
状态：已实测（本机 Bridge + 真实 Chrome 151 + 设备 192.168.5.124）

## 1. 真实 Chrome 全 action 矩阵（第 16/23D 项）

托管本地测试页（127.0.0.1:9333/r163-test-page.html：表单+可滚动区+按钮），经 Bridge RPC 导航并 snapshot（31 节点，textbox/button refs 齐全）。真实 Chrome 全 action 执行 + DOM 双向验证：

| Action | 结果 | DOM 验证 |
|---|---|---|
| fill | applied=true | name='R163 Field User' |
| click (Submit) | applied=true | result='submitted:R163 Field User'（DOM 真实流转） |
| type | applied=true | email='field@test.com'（需 text 字段，value 被协议忽略） |
| select | applied=true | email='selected@test.com' |
| hover | preview/confirm 链 | - |
| keypress (Enter) | applied=true | - |
| scroll | applied=true | window.scrollY=1796（真实滚动） |
| drag | applied=true | steps=8 坐标拖拽 |
| evaluate | applied=true | 读取 DOM 值（需 function 字段） |

所有写类 action 走 preview→planId→confirm 门禁（第 16 项安全边界在真实浏览器路径生效）。此前 mock host 验证升级为真实浏览器证据。

## 2. Web UI 工作台真实 Chrome 渲染（第 23B 项）

真实 Chrome 打开 http://127.0.0.1:8788/：完整渲染登录界面（Connect to a Bridge + Bridge URL/token 输入框 + Connect 按钮 + 安全提示），146 节点 AX 树。fill token + click Connect 均执行（applied=true）。

## 3. 现场缺陷修复：Codex 配置无效推理档位（环境根因）

**现象**：设备连接后 Bridge health 响应延迟 8-15 秒甚至超时；session.messages.loaded 每次耗时 33-41 秒；设备反复断连。

**根因链**：
1. `C:\Users\13359\.codex\config.toml` 与 `agents\luna-worker.toml` 中 `model_reasoning_effort = "max"` 无效（合法值 none/minimal/low/medium/high/xhigh）。
2. Codex App Server 启动报错且不监听 1945 端口。
3. Bridge 的 codex provider（requestTimeoutMs=30000）每次设备请求等待 30 秒超时，期间 health 响应被饿死。

**修复（已执行）**：两处 `max` → `high`，备份 `config.toml.bak-r163`/`luna-worker.toml.bak-r163`；修复后 `codex app-server` 无配置错误。另发现 App Server 依赖第三方 provider（gmn/aihub.top）认证，本地就绪受限 —— 属真实 Provider 现场；Bridge 可用 `AGENT_BRIDGE_CODEX_RUNTIME=exec` 切换（已验证 runtimeMode=oneshot 生效）。

**现场调整**：设备端 host profile provider 由 codex 改为 mock（RDB `agent_host_profile.provider_id`/`agent_profile`），使设备连接后请求 mock（快速）而非 codex（第三方慢）—— 已推送设备但设备随后锁屏，验证待解锁后继续。

## 4. 过程发现

- job_kill 杀 pwsh 包装不杀 Windows 进程树，残留 node worker 会与新 Bridge 抢 8788 —— 需显式按 PID 清理。
- 设备深度锁屏（开发者模式）无法自动解锁：wakeup/swipe/fingerprint click 均无效，需人工解锁。
- Web UI 页面在 Chrome 中保持 WS 自动重连，Bridge 重启后会立即连上并可能触发对已消失 session 的周期刷新（不阻塞 health，但产生重复 session.messages 请求日志）。

## 仍待 FIELD / 待解锁后

- 设备端 mock provider 连接验证（设备已锁屏，App 启动后应自动连上）。
- 真实 Codex App Server 就绪后的设备 codex 会话现场。
- 真机音频路由、真实 Provider quota、多 Bridge rolling。
