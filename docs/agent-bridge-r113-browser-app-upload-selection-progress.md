# R113 Browser App Workspace-File Upload Selection

更新时间：2026-08-10

## 目标

把 HarmonyOS App 的 Browser `upload` 动作从自由路径输入接到已有 workspace 文件列表，同时保持 Bridge 作为最终 realpath、符号链接、大小和 SHA-256 安全边界。

## 已完成

- 新增 `AgentHomeBrowserUploadPolicy`，规范化 workspace-relative 路径并拒绝绝对路径、URI、`.`、`..`、空路径段。
- 选择结果必须同时匹配当前 Browser workspace、当前 workspace file item 和 `kind=file`；目录、失效条目和跨 workspace 条目返回空值。
- Agent Home Browser action 面板新增“使用已选工作区文件”按钮；无有效文件选择或请求进行中时禁用。
- upload action 继续只向 Bridge 传相对路径，Bridge 继续执行 realpath、ownership、符号链接、大小、mtime 和摘要校验。
- 新增 `AgentHomeBrowserUploadPolicy.test.ets` 并注册到 `List.test.ets`。
- 新增中英文 workspace-file upload 资源，未硬编码用户文案。

## 本次验证

| 验证 | 结果 |
|---|---|
| 资源 JSON UTF-8 解析 | 通过 |
| `npm --prefix tools/agent-bridge run check:browser` | 通过 |
| SDK 23 `assembleHap --no-daemon --stacktrace` | `BUILD SUCCESSFUL in 1 min 885 ms` |
| HAP | 14,481,212 bytes |
| SHA-256 | `5931E5EE0B74A9E1E5552C81F67896736979192B452D508B5D45BCC27EB9F6F8` |
| `git diff --check` | 通过 |

## 尚未关闭的现场门

受支持平台 Browser host、真实上传/下载、恶意页面、登录态隔离、HarmonyOS App 全量动作、真机多窗口和真实 workspace 文件环境仍属于第 16、23D 的现场验收，不以本次源码验证替代。
