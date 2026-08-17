# R177：Web UI Metadata 生成/应用 + 工作区文件浏览现场（第 22/34、23B 项）

日期：2026-08-16
状态：已实测（真实 Chrome 151 + Bridge 0.1.4）

## 1. Web UI Metadata 生成与应用现场（第 22/34 项）

真实 Chrome 中完整走通 Session Experience 的 Metadata preview 链路：

- 选择新会话 agent → Metadata preview 面板可见（feature + provider capability 门通过）。
- Kind=sessionTitle，填写 prompt → 点击 Generate preview → 状态 Preview ready; edit before applying.，suggestion 文本返回（mock provider 回显 prompt，与 R162 语义一致），操作区渲染 Copy / Apply to session / Cancel。
- 点击 Apply to session → 会话标题更新为 suggestion，状态 Session title updated.；Bridge 侧 agent.list 确认 agent title 同步更新为 R177 metadata live verification（metadata.apply 生产链端到端：Web UI → Bridge → provider suggestion → apply → agent 记录）。

## 2. 工作区文件浏览现场（第 23B/30 项）

- files-section 可见且渲染真实工作区树：目录（.claude/.git/.hvigor/.idea/.local-rules/.rules/AppScope/docs/entry/hvigor/ngf_framework/oh_modules/paseo/scripts/src/temp/tools，各带 Open）、文件（.gitignore 1382 bytes、.versionrc 356 bytes、AGENTS.md 37785 bytes、AUDIT_REPORT.md 17298 bytes、build-profile.json5 1820 bytes、code-linter.json5 887 bytes 等，各带 Preview / Download）。
- files-refresh 正常。

## 3. 附注

- 本轮未修改源码（纯现场验证轮）；无 ArkTS 改动，无需 SDK 23 构建。
- R176 修复（hello host 身份）在本次会话中持续生效（Usage 面板数据正常）。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单/四类 metadata、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling、codex exec discovery 性能。