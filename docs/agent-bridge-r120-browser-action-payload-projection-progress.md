# R120 Browser action payload projection

更新时间：2026-08-10

## 目标

在 R119 参数范围校验之后，进一步保证 `browser.page.action` 只把 action 所需的最小字段送入 Browser host，避免客户端携带的 URL、路径、headers、环境或脚本字段被未知 host 解释。

## 实现

- `validateBrowserActionPayload()` 先校验 workspace/agent/host/instance/page scope 标识，再按 action kind 构造新的 payload；不再使用原始 payload 的对象复制。
- 每种 action 使用显式参数集合：元素 ref、输入值、keypress key、drag source/target/坐标/steps、scroll delta、evaluate function，以及 upload 的 legacy optional ref。
- `confirm`、`planId`、`kind`、`url`、`cwd`、`headers`、`functionSource`（非 evaluate）和未知字段不会进入 host payload；内部 `downloadDirectory` 和经过 realpath/hash 的 upload `filePaths` 仍由 manager 在校验后注入。
- drag `steps` 现在归一化为 2–20 的整数；分数、超界和非有限值返回 `browser_action_steps_invalid`。
- scope 标识与 ref/key 一样拒绝控制字符，限制为 256 UTF-8 bytes；计划摘要使用投影后的 payload，确认时未知字段变化不会影响 host 输入，也不会绕过 plan digest。

## 自动化证据

本轮实际执行：

```text
npm run check:r120
node scripts/check-browser-automation-live-smoke.js
node scripts/check-browser-cdp-host-smoke.js
node scripts/check-protocol-alignment-smoke.js
git diff --check
```

`check:r120` 包含 Node syntax、独立 validator smoke 和 Browser manager smoke；manager smoke 捕获真实 outbound host envelope，断言敏感/未知字段未被派发。上述命令均退出码 0。

## 未关闭的现场门

R120 只证明 Bridge payload projection 和既有 capability/plan 合约的源码行为。第 16、23D 仍保持“部分实现”：受支持平台 Browser host、HarmonyOS App 全量动作、真实上传/下载、登录态、恶意页面、长流和跨设备现场仍需单独验收。

本轮未修改 ArkTS/HAP，未构建、安装、启动或测试设备。重大 App 更新仍只能安装到 `5KLBB25A10203862`，并且只安装、不启动、不测试。
