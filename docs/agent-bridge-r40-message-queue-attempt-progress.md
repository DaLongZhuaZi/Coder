# R40 Message Queue Attempt Integrity

更新时间：2026-08-09

## 目标

依据 `docs/agent-bridge-paseo-alignment.md` 与 M5 队列协议要求，补齐失败消息重试的 attempt 语义：同一 `clientMessageId` 继续幂等，同一队列条目保留稳定 `queueId`，每次实际尝试拥有新的 `attemptId` 和可恢复状态。

## 范围

- Bridge `MessageQueueManager`：状态迁移、attempt 创建、发送/完成/取消状态更新、失败重试和持久化恢复。
- App Agent Bridge queue parser：可选读取当前 attempt 与 attempt history，缺字段时保持旧客户端默认值。
- Bridge 定向 smoke 与 ArkTS parser 测试。

不在本轮范围：Provider 并发策略、sending 中断的具体 Provider cancel、真实 Provider/真机现场、其他部分实现条目。

## 完成门

- [x] 旧队列状态可幂等迁移，缺少 attempt 字段不崩溃。
- [x] 首次发送、失败重试、重复请求和 daemon 重启均保持 `clientMessageId`/`queueId` 关系，并生成不同 `attemptId`。
- [x] App parser 能读取新增可选字段，旧响应安全降级。
- [x] 定向 smoke、Bridge 全量 check、ArkTS 静态/构建验证通过。
- [x] 更新 continuation progress、alignment 清单和架构证据；不把源码证据写成现场验收。

## 证据

本文件记录 R40 的真实执行命令与结果。

## 本轮结果

- `node --check src/agent-experience-manager.js`：通过。
- `node scripts/check-agent-experience-smoke.js`：通过。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：通过；已执行 precheck、check 和 postcheck，保留既有 node-pty AttachConsole 噪声但无失败退出。
- `assembleHap --no-daemon --stacktrace`：`BUILD SUCCESSFUL`；HAP `entry/build/default/outputs/default/entry-default-signed.hap` SHA-256 `C36BA685E954A06001B68458AF6481AAD38A9DAAB7B91798B7CECE6D70B1DCF1`；仅保留既有 syscap、弃用和异常声明警告。
- `git diff --check`：通过（仅报告工作区既有 LF/CRLF 提示）。
