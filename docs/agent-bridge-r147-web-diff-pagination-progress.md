# R147 Web Diff Pagination Integrity

更新时间：2026-08-10

## 目标

Bridge 的 `workspace.diff.get` 已提供文件/行游标、截断状态和原因。Web 旧实现按返回文本直接追加，重复点击或重试同一游标会重复渲染，并且没有展示截断原因。

## 已完成

- Web Diff request 保存 `fileCursor`、`lineOffset`、`nextLine`、`nextFile`、`truncated` 和 `truncationReason`。
- 每个文件/行游标生成稳定 `pageKey`，同一页重复请求不会再次追加；最多保留 128 个已加载游标，避免页面状态无限增长。
- Diff cache 同时保存分页游标、截断原因和已加载页，切换模式或回到缓存时不会丢失继续加载状态。
- Details 区新增受控截断状态区域；服务端返回 `truncated/truncationReason` 时展示原因，`Load more diff` 继续使用下一游标。
- 旧 Bridge 缺少新字段时仍显示首段，继续按钮按已有下一游标安全降级。

## 验证

本轮实际执行并通过：

- `npm run check:r147`
- Node syntax check（Web app、R147 smoke）
- `git diff --check`
- Bridge 全量 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`（含 R147）

Docker runtime smoke 按仓库既有 opt-in 规则跳过。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。

## 仍待现场

- 真实大仓库、二进制/解析失败 Diff 和长流性能。
- 旧 Bridge、真实多标签及 HarmonyOS App Diff 展示。

第 23B 继续保持“部分实现”；第 30 项既有源码状态不变，本记录只关闭 Web Diff 分页完整性子阶段。
