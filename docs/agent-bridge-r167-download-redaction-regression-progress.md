# R167：Browser 下载链路 + 公开 DTO 脱敏 + 全量回归

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4）

## 1. Browser 下载链路（第 16/23D 项）

- 测试服务器目录页（127.0.0.1:9333）真实文件列表渲染（AX 树完整）。
- click 下载链接：applied=true；`browser.download.list` 返回结构化结果（tracking=cdp-events，空列表安全返回）。
- evaluate 触发 data URL 下载：value='triggered'（data URL 不产生 CDP download 事件是浏览器行为，非 Bridge 缺陷）。

## 2. 公开 DTO 脱敏（第 16 项安全边界）

`browser.permission.get`（真实 RPC）：
```
downloadDirectory: ".agent-bridge-downloads"   # marker，非绝对路径
全文不含 "DevEcoStudioProject" 绝对路径        # R69/R71 脱敏生效
```

## 3. 设备数据库确认

`agent_host_profile`：provider=mock、model=mock-fast、endpoint=ws://192.168.5.121:8788/ws —— mock 切换已持久化（设备解锁后启动即连 mock，无 Codex 阻塞）。

## 4. 全量回归（R165 修复后）

`AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check` 退出码 0，0 失败行（含 web/app.js 语法 + multitab/screenshot/voice/browser smoke）。

## 仍待 FIELD

- 真实 HTTP 下载（CDP download 事件，需真实文件服务器下载响应）。
- 设备端（深度锁屏）：mock provider 连接、App 面板现场。
- 真实 Codex App Server、多 Bridge rolling。
