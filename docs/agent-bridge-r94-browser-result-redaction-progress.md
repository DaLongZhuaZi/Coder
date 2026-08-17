# R94 Browser host 结果递归脱敏

更新时间：2026-08-09

## 目标

收口第 16、23D 的 Browser 公共结果边界。R92/R93 已覆盖 host warning 与 `page.logs`，本阶段把同一安全约束扩展到所有外部 host result，避免嵌套字段绕过浅层复制。

## 已完成

- [x] `BrowserAutomationManager.copyHostResult()` 改为递归公开 DTO：限制深度、对象键数、数组条目和 UTF-8 文本大小。
- [x] 嵌套 `headers`、`cookies`、token、secret、password、authorization、private-key、cwd、args、env、file/path/download path 等敏感键不再进入公开 RPC。
- [x] 所有公开 URL 统一只接受 `http`/`https`/`about:blank`；移除 URL 凭证并删除 token/secret 等敏感查询参数，非公开协议不外泄。
- [x] message/error/warning/remediation/reason/detail 等诊断文本继续执行控制字符、URL、路径和 credential 脱敏；普通 snapshot/page/screenshot 字段保持兼容。
- [x] 新增 manager smoke，覆盖 page list 嵌套 headers/cookies/password/path 和带凭证 URL；现有下载、日志、CDP 和 live smoke 保持通过。

## 实际验证

```text
node --check src/browser-automation-manager.js
node --check scripts/check-browser-automation-manager-smoke.js
node scripts/check-browser-automation-manager-smoke.js
node scripts/check-browser-cdp-host-smoke.js
node scripts/check-browser-automation-live-smoke.js
node scripts/check-protocol-alignment-smoke.js
npm run check:browser
AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check
git diff --check
```

以上命令本轮均退出码 0；Docker runtime 仍按仓库规则仅在显式环境变量开启时执行。本轮只修改 Node Bridge 与 smoke/文档，没有 ArkTS/HAP 改动，未安装、启动或测试设备。

## 未关闭门

- [ ] 受支持平台 Browser host、HarmonyOS App 全量动作、真实上传/下载、登录态隔离、恶意页面和真机现场。
- [ ] 多标签、旧 Bridge、长流和跨平台 Browser host 现场验证。

R94 只关闭公共结果递归脱敏源码子阶段，第 16、23D 继续保持“部分实现”。
