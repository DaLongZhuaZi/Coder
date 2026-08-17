# R145 Web Rich Content Capability Gate

更新时间：2026-08-10

## 实现

- Web compatibility 将 `richContentAst` 纳入已知 capability 列表。
- AST 节点超过 64 项时保留最多 63 项有效节点，并追加 `fallback` 节点，`reason=node_limit`，避免静默丢失截断语义。
- Web renderer 只在 Bridge 明确发布 `richContentAst=true` 时渲染 `contentNodes`；旧 Bridge 或缺少 flag 时继续显示原始 `text/content`。

## 验证

- `npm run check:r143`
- `npm run check:r145`
- Web compatibility、Web app 和 rich-content smoke 的 Node 语法检查

以上命令本轮通过。该阶段仅收口第 22、27、23B 的 Web AST 源码子边界，不替代真实旧 Bridge、多标签、长流、HarmonyOS App 和真机验证。
