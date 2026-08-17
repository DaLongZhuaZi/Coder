# Agent Bridge R17 remote config URL integrity

更新时间：2026-08-08

## 目标

继续收口第 14 项远程配置的输入安全边界。本阶段只处理远程配置 URL 解析和重定向约束，不改变签名 schema、配置优先级或 Fleet 现场验收状态。

## 本轮完成

- [x] 新增统一 `normalizeRemoteConfigUrl()`，要求 credential-free HTTPS URL，拒绝 HTTP、用户名/密码、fragment、控制字符和无效 host。
- [x] fetch 入口和默认 HTTPS JSON 下载器共用 URL 校验；每次重定向重新验证 HTTPS/凭证/fragment，禁止通过重定向绕过入口校验。
- [x] 非法 URL 返回稳定 `https_url_invalid`，不执行网络请求，也不写入 fetched/active remote config state。
- [x] remote config smoke 覆盖合法 HTTPS、HTTP、嵌入凭证和 fragment。

## 本轮验证

实际执行并通过：

```text
node --check src/daemon-remote-config-manager.js
node --check scripts/check-daemon-remote-config-smoke.js
node scripts/check-daemon-remote-config-smoke.js
npm run check
```

全量 `check` 退出码为 0，并实际执行了 remote-config smoke、Browser smoke、协议对齐和 postcheck。

## 仍待现场/后续源码工作

- Windows/Linux/macOS 全局安装、自启重启、滚动升级/回滚和多 Bridge 现场。
- 真实签名目录、过期/版本不兼容配置和原子写入失败现场观察。
- App Fleet 多 host 现场及旧 Bridge 缺实例字段降级。

第 14 项继续保持“部分实现”。
