# R170：Web UI 真实多标签现场验证（第 23B 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 headless CDP + Bridge 0.1.4，双标签并行）

## 1. 场景

此前第 23B 项剩余 FIELD 为『真实多标签/旧 Bridge/长流/真实浏览器现场』。本轮在真实 Chrome（CDP 127.0.0.1:9224，经 chrome-cdp-field host 注册到 Bridge）中打开两个 Web UI 标签并同时登录工作台，验证多标签稳定性与 R165 风暴修复在多标签场景下的保持。

## 2. 执行与证据

- 创建标签 TAB1（754B6D7E...）/ TAB2（D47EA652...），均导航到 http://127.0.0.1:8788/。
- Chromium AX 树惰性计算现象：页面刚创建后的前几次 snapshot 只返回 generic none 节点（2936 chars），约 30s+ 或再次 snapshot 后角色/标签才完整 —— 浏览器行为，非 Bridge 缺陷；脚本以重试等待处理。
- 双标签依次登录（经 preview→confirm 门禁）：fill Bridge URL http://127.0.0.1:8788（applied=True）、fill token 123456（applied=True）、click Connect（applied=True）。
- 两个标签各自渲染完整工作台（5727 chars）：Connected、Host 区、Agents + New、workspace 头 Mock: F:\DevEcoStudioProject\Coder。
- 稳定性复检（6s 后再 snapshot）：两个标签仍 Connected，工作台内容一致。
- Bridge 侧：两个独立 web 客户端连接（web_5a594004-850e-41fa-a337-80d7b2d28cf3 / web_6651e7b7-89b1-4c58-a96f-322a7cb5c414），activeConnections 3→4（含 CDP host 与遗留 Web UI 标签）；自连接后 session.messages.loaded 计数为 0 —— R165 风暴修复在多标签下保持。
- 期间唯一 request.failed 为遗留标签对已消失 session（ses_004a30e159a1b72c）的周期单次查询，R168 冷却使其 1-2ms 快速失败，无风暴。

## 3. 意义与剩余

- 第 23B 项『真实多标签 + 真实浏览器现场』子项已在本机现场闭环。
- 仍待 FIELD：旧版本 Bridge 的现场兼容、超长会话/长流、HarmonyOS App 端全量动作（设备深度锁屏阻塞）。

## 4. 附注

- 测试用双标签已通过 browser.page.close 关闭，Bridge 恢复基线连接数。
- 本轮未修改任何源码（纯现场验证轮）；Bridge 全量回归由 R167 退出码 0 基线 + 本轮 npm run check 复跑（另行记录）。