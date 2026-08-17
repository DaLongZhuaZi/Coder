# R32 Remote config state integrity

更新时间：2026-08-09

## 目标

收口 M4 远程配置在 Bridge 重启、状态损坏、回滚和持久化失败时的安全语义。启动只能做本地 reconcile，不联网、不静默修复；无效状态必须可诊断，不能被 rollback 或 apply 当作有效配置使用。

## 实施

- `daemon-remote-config-manager.js` 增加 schema v1 字段校验：版本、scope、priority、values 深度/数量/字符串限制、有限数值和签名编码；未知顶层字段保留但返回 `unknown_fields_ignored` warning。
- 启动 reconcile 分别校验 active、previous 和 fetched 条目，检查文档签名、摘要和来源 URL；active/previous 保留可诊断的 validation，损坏 fetched 清除，整体标记 `degraded`，不执行网络请求。
- `validate`、`preview` 和 `apply` 重新计算 fetched digest，阻断状态文件中的摘要漂移。
- rollback 在 preview 和 confirm 路径重新校验 previous，防止磁盘状态被替换或损坏后切换到无效版本。
- fetch/apply/rollback 的原子写失败统一返回 `state_persist_failed`，plan 不消费，当前有效状态不报告为成功。
- status 增加可选 `fetchedVersion`、`manifestDigest`、`previousValidation` 和稳定 degraded failure category，不返回完整远程文档或敏感配置。

## 验证

- [x] `node --check src/daemon-remote-config-manager.js`
- [x] `node --check scripts/check-daemon-remote-config-smoke.js`
- [x] `node scripts/check-daemon-remote-config-smoke.js`（退出码 0）
- [x] smoke 覆盖 schema/unknown field、损坏 previous 启动降级、rollback 阻断、摘要漂移和写盘失败结构化结果。
- [x] Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`（退出码 0；包含 R32 postcheck；默认 conpty-dll 在本机 terminal-file smoke 无输出，system-conpty 全量通过）
- [x] `git diff --check`（退出码 0；仅有既有 LF/CRLF 提示）

## 边界

- Windows/Linux/macOS 全局安装、自启、升级回滚和多 Bridge rolling 仍需现场验收；本 R32 不改变第 14 项“部分实现”状态。
- 本阶段只修改 Node Bridge、smoke、文档和检查接线，没有 ArkTS 改动，不生成 HAP，不执行设备安装。
