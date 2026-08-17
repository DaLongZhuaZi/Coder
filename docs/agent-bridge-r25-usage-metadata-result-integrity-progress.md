# R25 Usage / Metadata 结果完整性

更新时间：2026-08-08

## 目标

继续收口清单第 22、34 项中可由 Bridge 直接证明的 Provider 结果边界。该阶段区分真实配额与缺失/非法数据，拒绝把未知 metadata kind 或未受限 Provider 输出静默转成可应用建议，不把真实 Provider 现场写成源码已完成。

## 已完成

- [x] Provider usage window 的 remaining、limit、used 只接受有限、非负且不超过安全整数上限的数值；负值、Infinity 和超限值保持字段缺失。
- [x] quota event 只从有效 remaining/limit/resetAt 产生，非法数值不会落入 Usage store 或变成 `0`。
- [x] metadata kind 缺失时兼容默认为 `sessionTitle`，显式未知 kind 返回 `metadata_kind_invalid`。
- [x] metadata suggestion、alternative 和 warning 使用统一控制字符清理、UTF-8 长度限制、去重和节点上限；发生截断返回 `metadata_result_truncated` warning。
- [x] 通用 Provider 失败只返回稳定的 `metadata_generation_failed`/结构化校验类别和受控 remediation，不回显原始异常文本。
- [x] Provider usage 和 metadata scope smoke 已扩展并纳入 Bridge 全量 `check`。

## 本轮实际验证

```text
node --check tools/agent-bridge/src/provider-usage-service.js
node tools/agent-bridge/scripts/check-provider-usage-smoke.js
node --check tools/agent-bridge/src/metadata-scope.js
node --check tools/agent-bridge/src/server.js
node tools/agent-bridge/scripts/check-metadata-scope-smoke.js
```

以上定向命令均退出码 0。随后实际执行 Bridge 全量 `npm run check`，退出码 0，并包含 R12、R13 与 Voice platform postcheck。本阶段未修改 ArkTS，不重复 HAP 构建，现场门仍由 R24/FIELD 记录。

## 尚未关闭的现场门

- 真实 Provider quota endpoint、套餐字段、长会话 usage/compaction 和四类 metadata 数据。
- 真机 Usage/Diagnostics 展示、网络异常和跨 host 现场。

因此第 22、34 项继续保持“部分实现”；本阶段只关闭 Provider 结果完整性源码子阶段。
