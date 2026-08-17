# R180：设备解锁后 App 端面板全量现场验证（第 14/21/23D/32/33/34 项）

日期：2026-08-16
状态：已实测（真机 ADA-AL00U + Bridge 0.1.4 + 截图/布局/hilog 三重证据）

## 1. App 连接与基础会话（现场）

- `aa start` 成功（设备解锁后 10106102 消失）；屏幕：`NGFCoder / Coder / 25 会话 / 已连接`。
- mock 会话正常：`mock.context Loaded mock workspace context.` + 底部会话条 `模型: mock-fast · 空闲 · 上下文: 0`。
- Bridge 日志：`harmony-coder-app` / `harmony-coder-fleet` 连接、`bridge.connected providers=11 protocolVersion=agent-bridge.v1`。

## 2. 第 14 项 Daemon Fleet App 端闭环（现场）

连接设置 → Daemon 实例集群面板：
- **实例统计卡**：实例总数 `1`、健康聚合 `健康: 1`（stall 期间实测变化为 `不可达: 1`——实时状态更新真实生效）、Bridge 版本分布 `0.1.4: 1`、配置版本分布 `未记录: 1`、告警实例 `0`、缺失心跳 `0`。
- **单实例详情**：`TX_2 · healthy · ins__UFSd3cb1roYlqDO · 0.1.4`、最近心跳 `2026-08-15T20:12:26.044Z`、`隔离` 按钮。
- **滚动操作**：`刷新实例`/`滚动重启`/`滚动升级`/`滚动回滚` 按钮齐全；点击刷新实例 → `正在查询实例状态...` → 数据刷新（Fleet 查询链路真实工作）。
- **计划状态**：preview + 待处理/已排除/已完成/失败 全 0。

## 3. 第 34 项 App 端诊断（现场）

- Daemon 诊断区：`等待重启 否 / 日志路径 .agent-bridge/logs/daemon.log / 诊断 正常 / 导出 JSON / 导出文本 / 生成时间` + 分组报告（`Daemon config is present.`、`Daemon log directory is writable.`、`Managed process ledger directory is writable.` 等）。

## 4. 第 23D 项 App 端 Browser 面板（现场）

工作区 tab 浏览器页面区完整渲染：
- 浏览器主机：`当前工作区没有兼容的浏览器主机。`（fail-closed，CDP host 注册于其他 workspace 作用域——scope 隔离语义真实生效）。
- 浏览器实例 + `创建实例`、`新建页面` 按钮、`当前主机没有报告浏览器实例。`。
- 域名权限：`允许的域名` 输入 + `更新权限` + 状态（`尚未允许任何域名`、`此 Bridge 未提供下载目录状态`）。

## 5. 第 21/33 项 Voice（现场）

- 设备 hilog：App 周期轮询 `voice.status` 并消费完整能力矩阵——`available:false, speechRecognition:false, textToSpeech:false, streamingUpload:true, capabilities{audioCapture/audioPlayback/speechToText/textToSpeech/remoteSpeechToText/remoteTextToSpeech/voiceActivityEvents/interruptionHandling 全 false}, privacy{status:not_a...}`（R166 验证的 fail-closed 矩阵在真机 App 端实际消费）。
- 无远程 STT/TTS 端点时 `supportsVoiceInput/supportsRemoteVoiceStt` 门禁正确关闭；真机实际录音/播放仍需现场语音服务（FIELD）。

## 6. 第 32 项 自动化与协作（现场）

- `自动化与协作` 区：定时任务/循环/房间 子标签；`chat.room.list · 操作已完成`（房间列表 RPC 现场完成）。
- 定时任务配置：任务名称/运行提示词/cron `0 9 * * *`/时区 `UTC`/`创建后启用` 开关/`预览保存`；`当前没有定时任务`。

## 7. 工作区与数据 tab（现场）

- 工作区 tab：`按主机浏览工作区 TX_2 已连接`、工作区列表（Coder / R174 Web New Agent）、注册表校验 `Workspace path is valid.`、`保存本地/预览导入/预览打开/刷新注册表/工作区诊断` 按钮。
- 数据 tab：`清理当前会话`（清理会话/清理预览）+ `重置本地数据库`（重置本地数据）。
- 环境治理：R174 测试遗留工作区 `wks_DWumDyEnZkNg3FT0` 已从 Bridge 注册表归档（`confirm:true` 后列表仅剩 wks_zaj5）。

## 8. 附注

- 屏幕证据：`.local-rules/screen9-25.jpeg`；布局 dump 与 hilog 已在本轮验证。
- 自动化注意点：真机 uiInput 坐标为屏幕 px；设置页深滚动持久化，慢速拖拽/dircFling 需谨慎防回弹退出；系统灵动岛音乐组件悬浮覆盖顶部。
- 本轮未修改 ArkTS/HAP（纯现场验证）；无 SDK 23 构建。

## 仍待 FIELD

- 真机实际语音录音/播放（需现场语音服务与权限交互）、真实 Provider quota 数据展示、旧 Bridge 现场、真实 GitHub、多 Bridge rolling。