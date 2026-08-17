# R178：Web UI 消息队列面板现场（第 22/34 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4）

## 1. Web UI Queue 面板现场

真实 Chrome 中完整走通 Session Experience 的 Message queue 面板：

- Queue 面板可见（feature 门通过），初始状态 `No queued messages for this session.`。
- 经 Web UI composer 连续发送 2 条消息后：queue 列表渲染队列项 `accepted · web_<requestId>` + `Attempt ... · <时间戳>`（clientMessageId + attempt 状态，R88 消费语义）。
- composer 消息本体正常送达会话（mock 快速处理，队列项短暂驻留后完成——符合 queuePolicy=queue 设计）。

## 2. 附注

- MCP/CLI live 由 postcheck 的 check:r58（management-cli-live + mcp-live）在 R176 全量回归中覆盖（EXIT=0，本轮无相关源码改动）。
- 本轮未修改源码（纯现场验证轮）；无 ArkTS 改动，无需 SDK 23 构建。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling、codex exec discovery 性能、长队列/断线重试现场。