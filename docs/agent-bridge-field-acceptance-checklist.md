# Agent Bridge FIELD 现场验收清单

日期：2026-08-15
说明：本清单聚合 alignment 中各“部分实现”条目的现场验收门，供现场执行。只列出无法本地替代的真机/真实环境验证；本机已通过的源码与自动化证据见 `docs/agent-bridge-paseo-alignment.md` 与各 `docs/agent-bridge-rXXX-*-progress.md`。现场通过后才能把对应条目改为“已实现”，不允许用 mock/live smoke 替代。

## 通用前置

- 目标设备仅 `5KLBB25A10203862`；仅安装 HAP，不启动、不测试、不读日志、不操作其他设备（除非现场授权变更）。
- 构建证据以现场重新执行的 SDK 23 `assembleHap --no-daemon --stacktrace` 退出码、HAP 大小与 SHA-256 为准。

## 第 14 项 Daemon Fleet App 端闭环

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | Windows/Linux/macOS 全局安装 Bridge（`npm i -g` + `ngf-agent-bridge`），重启系统后 daemon 自启 | 三个平台安装成功、开机后 supervisor/worker 自动恢复、instanceId 稳定 |
| 2 | 两个真实 Bridge host profile 同时连接 App，A → B → A 切换 | Fleet 面板两 host 均可查询展示；切换后无跨 host 状态串线（旧 epoch 响应被丢弃） |
| 3 | Fleet rolling restart/update/rollback 双 Bridge 执行 | restart 后 generation 增长且健康；update/rollback 版本校验通过；失败实例首错停止、后续保持 pending；App 重启后 interrupted 记录恢复且不自动继续 |
| 4 | 旧 Bridge（无 `daemonFleetTarget`）与缺字段 host 并存 | 面板仍可见（App-local policy），旧 host 只读展示、不进入 rolling target |
| 5 | isolate/re-enable 操作 | 排除与恢复即时生效，preview 分类正确 |

## 第 16 项 Browser action 与平台 host 安全边界

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | 受支持平台 Browser host（真实浏览器/CDP/桌面）注册 | 显式 capability + readiness 校验通过；未支持平台返回 `browser_platform_host_unavailable` |
| 2 | 恶意页面/登录态页面执行敏感 action | 敏感 action 先 snapshot digest，页面变化返回 `browser_target_changed` 且不派发；登录态/iframe/跨域场景行为稳定 |
| 3 | 真实上传（workspace 文件）与下载 | realpath/大小/SHA-256 校验通过；下载进入受管目录；公开 DTO 无绝对路径/凭证 |
| 4 | 安全审计记录 | 审计只含 request type/workspace/agent/host/page 与结构化类别，无输入正文/脚本/上传内容/截图 |
| 5 | nonce/token 轮换/旧连接失效 | 重放 nonce 在 101 前被拒；token 变更后旧连接断开 |

## 第 21、33 项 Voice 端到端

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | 真机麦克风授权/拒绝/永久拒绝 | 授权后可录音；拒绝显示 remediation；永久拒绝跳转设置可恢复 |
| 2 | 耳机/蓝牙设备切换 | 录音/播放路由跟随设备；切换不产生残留状态 |
| 3 | 来电/其他媒体抢占 | AudioSession 中断处理正确；恢复后不误报、不残留活跃状态 |
| 4 | 前后台/锁屏 | 后台拒绝新录音；回到前台可恢复 |
| 5 | 弱网/长录音 | STT 弱网下取消/超时/迟到响应被丢弃；长录音内存稳定 |
| 6 | 真实 STT/TTS Provider | 远程 STT partial/final、远程 TTS MIME/采样率/声道/压缩 AVPlayer 播放正确；停止/打断/不重复播报 |

## 第 22、34 项 Provider usage/metadata 生产链

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | 真实 Codex/OpenCode/Gateway Provider 长会话 | turn usage、compaction、quota reset、budget threshold 事件正确进入 Usage store 并展示 |
| 2 | 真实 quota endpoint（HTTPS + 凭证） | 套餐/quota window/details 正确解析展示；HTTP/凭证 endpoint 不发布能力 |
| 3 | 四类 metadata（sessionTitle/branchName/commitMessage/pullRequest） | preview/编辑/apply 正确；branch/commit/PR 走 preview→confirm；真实 GitHub 权限验证 |
| 4 | 断线/重连后的 UsageManager 恢复 | 重连后 summary/event 恢复；重复事件幂等 |
| 5 | App/Web 真机展示 | availabilityState 六态、unavailable/estimated 语义、session/day/month 窗口在真机正确显示 |

## 第 23B 项 Web UI 完整工作台

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | 真实旧 Bridge 兼容降级 | 缺 capability/字段安全降级、不可达状态与兼容提示正确 |
| 2 | 真实双标签/刷新恢复/注销传播 | BroadcastChannel scope 正确；bfcache 恢复；跨标签 logout 生效 |
| 3 | 长终端流/大 diff/真实 Provider usage/metadata | Terminal V2 序列完整；diff 分页正确；experience 区数据正确 |
| 4 | 浏览器现场 | Browser 控制面（host/instance/page/action/permission/download/screenshot）在真实浏览器可用 |

## 第 23D 项 Browser Automation 完整能力

| # | 验收步骤 | 通过标准 |
|---|---|---|
| 1 | 真实受支持平台 host + CDP 页面 | 全量动作（click/fill/type/keypress/hover/select/drag/upload/scroll/download/evaluate）在真实页面执行正确 |
| 2 | 真实上传/下载 | 文件真实写入受管目录；列表/状态正确 |
| 3 | 恶意页面/登录态 | 安全边界（digest/scope/credential 隔离）在真实场景成立 |
| 4 | HarmonyOS App 全量动作真机 | App 控制面在真机与真实 host 协作完成 |

## 现场执行规则

- 每项现场验证记录实际命令、设备、日期与结果；只有现场证据齐备才更新 alignment 条目状态。
- 现场失败只重开对应缺陷子步骤，不回退已通过的源码与自动化证据。
- 现场验收不得修改本清单的“通过标准”来适配失败结果。
