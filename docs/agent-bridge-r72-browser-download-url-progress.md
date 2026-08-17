# R72 Browser download URL public boundary

## Objective

继续依据对齐清单第 16、23D 的实际源码收口 Browser Automation 的公开结果安全边界：下载目录和文件路径已经在 R71 脱敏，本阶段补齐下载 URL 的凭证清理，避免外部 Browser host 或 CDP 将 `user:password@host` 传播到 Bridge RPC、App 或其他消费端。

## Scope

- 仅处理 `page.action(download)` 和 `download.list` 的公开下载记录 URL。
- Bridge 发给受控 Browser host 的内部 command payload 不改变。
- 只允许公开无凭证的 `http://` 或 `https://` URL；其他值从公开结果移除。
- 不把该源码证据当作真实浏览器、平台 host、上传下载或真机现场验收。

## Tasks

- [x] 增加公开下载 URL 归一化 helper，移除用户名/密码并限制控制字符和长度。
- [x] 接入 Browser manager 外部 host result 和 CDP `download.list`。
- [x] 补齐 manager/CDP/live/protocol smoke 断言。
- [x] 执行定向 smoke、Bridge 全量 check 和 `git diff --check`。
- [x] 更新 continuation、architecture、README 和 Paseo 对齐清单证据。

## Verification

## Verification result

- `node --check src/browser-automation-manager.js; node --check src/browser-cdp-host.js; node --check scripts/check-browser-automation-manager-smoke.js; node --check scripts/check-browser-cdp-host-smoke.js; node --check scripts/check-browser-automation-live-smoke.js; node --check scripts/check-protocol-alignment-smoke.js`：通过。
- `node scripts/check-browser-automation-manager-smoke.js`：`browser automation manager smoke ok`。
- `node scripts/check-browser-cdp-host-smoke.js`：`browser CDP host smoke ok`。
- `node scripts/check-browser-automation-live-smoke.js`：`browser automation live smoke ok`。
- `node scripts/check-protocol-alignment-smoke.js`：`protocol alignment smoke ok`。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0，包含本轮 Browser manager/CDP/live 与 postcheck。
- `git diff --check`：退出码 0；仅有既有 LF/CRLF 转换提示。

没有 ArkTS/HAP 修改，本阶段不构建、不安装设备；若后续产生重大 HAP 更新，只允许安装到 `5KLBB25A10203862`，且不启动或测试。
