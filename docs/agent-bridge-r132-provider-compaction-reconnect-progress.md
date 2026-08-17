# R132 Provider compaction reconnect evidence

更新时间：2026-08-10

## 缺口

R131 已验证同一 Provider 实例内的重复通知去重，但原 smoke 未验证 Provider 实例重建后的 eventId 稳定性。单实例回放无法排除未来实现重新依赖进程内序号的回归。

## 补强

`check-provider-recorded-session-smoke.js` 在首次 Codex compaction 回放后创建全新的 `CodexAppServerProvider`，重新回放同一脱敏 fixture，并断言：

- 新实例仍只产生三条 compaction usage event。
- 新实例的 eventId 顺序与首次回放完全一致。
- 新实例 transport 在 smoke 结束时被释放，不留下测试资源。

该测试覆盖了跨 Provider 实例的断线/重连模型；不改变公共 RPC、事件字段或旧客户端兼容行为。

## 本次验证

实际执行并通过：

```text
node --check scripts/check-provider-recorded-session-smoke.js
npm run check:r131
git diff --check
```

## 范围与未关闭项

本轮只修改 recorded-session smoke 和文档，未修改 ArkTS/HAP，未构建、安装、启动或测试设备。该证据增强第 22、34 的 Provider compaction producer 重连回归，不替代真实 Provider 长会话、quota/账单、四类 metadata、网络中断和现场 App Usage/Diagnostics 验收；两项继续保持“部分实现”。
