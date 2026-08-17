# R143 Web Rich Content AST 消费闭环

日期：2026-08-10

## 范围

本阶段收口第 22、27、23B 的 Web Rich Content AST 消费，不宣称真实 Provider、现场浏览器或 HarmonyOS 真机验收完成。

## 已完成

- `src/web/compatibility.js` 新增统一 Rich Content normalizer，支持 text、code、link、file、tool、todo、diff、warning 和 fallback；节点数量、文本/代码 UTF-8 大小、代码行数、文件相对路径、workspace scope、todo 必填字段和 URL 协议均有边界。
- 未知 node/tool、不安全 link、路径穿越、workspace mismatch、非法 todo 和超限内容均降级为 fallback；HTTP(S) link 会移除 userinfo 与敏感 query，不把未验证地址写入 DOM。
- `normalizeSessionMessages()` 同时覆盖 array、messages、timeline、items 四种旧/新响应形状，并保留原始 `text` 等兼容字段；缺少 AST 时 Web 仍使用现有纯文本渲染。
- `src/web/app.js` 新增受控节点 renderer：code/diff 使用 bounded `pre`，link 使用安全 external anchor，file 只在当前 workspace 内复用现有 Diff 入口，tool/todo/warning/fallback 使用结构化卡片；渲染不使用 `innerHTML`、`eval` 或不可信属性拼接。
- `src/web/rich-content.css` 作为同源静态资源加载，沿用现有 CSP 和 Web asset path 约束。
- 新增 `check-web-rich-content-smoke.js`，并接入 `check:r143` 与 Bridge `postcheck`；覆盖节点类型、未知降级、恶意 URL、路径穿越、代码/节点上限和旧 session message 兼容。

## 本次验证

- `npm --prefix tools/agent-bridge run check:r143`：通过，输出 `web rich content smoke ok`。
- `node --check src/web/compatibility.js`：通过。
- `node --check src/web/app.js`：通过。
- `node --check scripts/check-web-rich-content-smoke.js`：通过。
- 本阶段未修改 ArkTS/HAP，未构建、安装、启动或测试设备。

## 仍待现场验收

- 真实 Provider AST 长消息/流式 delta、真实 Web 多标签和长终端/大 Diff 流。
- HarmonyOS App Rich Content renderer 与真机键盘/窗口行为。
- 恶意网页、真实 Browser host、跨域登录态及 Browser Automation 全量现场。
