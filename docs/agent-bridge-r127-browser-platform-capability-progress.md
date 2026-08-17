# R127 Browser platform capability fail-closed 进度

更新时间：2026-08-10

## 本轮问题

Agent Home 对旧 Bridge 的 external/CDP host 使用 legacy connected gate 是兼容要求，但相同路径也可能把显式 `hostKind=harmonyos` 或 `capabilitySource=platform` 的 host 当作普通已连接 host 放行。仅凭平台名称或连接状态不能证明存在受支持的平台 adapter。

## 实施内容

- 新增 `AgentHomeBrowserCapabilityPolicy`，把平台 host 识别、需要验证的 capability 和 readiness 判断集中到纯逻辑策略。
- 显式平台 host 必须同时满足 `browserHostCapabilityMetadata=true`、`browserPlatformHost=true`、`connected=true` 和 `readiness=ready`；缺少任一项或状态为 degraded/unavailable 时 fail closed。
- 非平台 external/CDP host 在旧 Bridge 缺少 metadata 时继续保留 legacy connected 兼容；新 Bridge 有 readiness 时仍只允许 `ready` host dispatch。
- Agent Home host 状态提示、command/action gate 和页面选择均复用该策略；未验证的平台 host 使用已有受控 not-ready 文案，不创建旁路能力。
- `AgentHomeBrowserRequestCoordinator.test.ets` 增加平台 capability 缺失、degraded 和旧 external host 兼容边界；`check-browser-app-scope-smoke.js` 增加静态接线断言。

## 本轮验证

- `npm --prefix tools/agent-bridge run check:r126`：通过，输出 `browser app scope smoke ok`。
- `npm --prefix tools/agent-bridge run check:browser`：通过，Browser manager/event scope/CDP/live/protocol smoke 均通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：通过，Bridge 全量 Node/CLI/MCP/Provider/daemon/Web/Voice/Browser 回归及 postcheck 均通过；Docker runtime 按仓库规则受控跳过。
- `git diff --check`：无实际空白错误，仅有既有 LF/CRLF 转换提示。
- SDK 23 `assembleHap --no-daemon --stacktrace`：通过，`BUILD SUCCESSFUL in 35 s 556 ms`；产物 `entry/build/default/outputs/default/entry-default-signed.hap`，大小 `14,513,974` bytes，SHA-256 `9D46569E313A4DCC701701792A5306F895BEC854D6CE9C7B4D59B45027476391`。
- 构建前发现并修正 ArkTS `arkts-no-standalone-this`：静态策略类改用类名调用静态方法。
- 本轮未执行设备安装或设备测试；如后续发生重大 App 更新，安装目标仍仅允许 `5KLBB25A10203862`，且只安装不启动/测试。

## 对齐结论

R127 收口第 16、23D 的 HarmonyOS App 平台 capability gate 源码子阶段。真实受支持平台 adapter、Browser 登录态/恶意页面、上传下载、弱网长流和 HarmonyOS 真机全量动作仍需现场验收，相关条目继续保持“部分实现”。
