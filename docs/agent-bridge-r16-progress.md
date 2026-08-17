# Agent Bridge R16 Browser host result integrity

更新时间：2026-08-08

## 目标

继续收口第 16 项安全加固和第 23D Browser Automation 的源码边界。本阶段只处理 Bridge 接收 Browser host 结果时的信封完整性，不把平台 host、HarmonyOS App 全量动作或真实浏览器现场验收误写为完成。

## 本轮完成

- [x] Bridge 不再使用不可信 host result 直接覆盖 `ok`、`commandId`、`hostId`、`updatedAt`、失败字段或告警字段。
- [x] Host result 复制使用显式安全属性定义，过滤 `__proto__`、`constructor` 和 `prototype`，避免结果对象触发原型污染或伪造响应归属。
- [x] 结果超限、错误 host connection、迟到/重复 commandId 继续返回稳定失败类别；一次性 pending 在首次响应后立即消费。
- [x] Browser manager smoke 增加伪造信封字段、原型污染键和重复结果断言。
- [x] Browser upload preview/confirm 绑定 realpath、文件大小、mtime 和 SHA-256；默认限制单文件 64 MiB、总计 128 MiB，文件在预览/确认期间变化时返回 `browser_plan_stale`。

## 本轮验证

实际执行并通过：

```text
npm run check:browser
npm run check
git diff --check
```

其中 `check:browser` 覆盖 Browser manager/CDP/live/protocol smoke；全量 `check` 退出码为 0。`git diff --check` 仅报告工作区既有 LF/CRLF 警告，没有 whitespace error。

## 仍待现场/后续源码工作

- 至少一个真实受支持 Browser host（Electron/Chromium 或其他平台）及真实上传、下载、登录态、恶意页面现场。
- HarmonyOS App 的 navigate/action/logs/download/close 全量入口和真实 capability 降级。
- 多标签、旧 Bridge、长 terminal/diff 流和真实浏览器生命周期观察。

因此第 16、23D 仍保持“部分实现”。
