# Agent Bridge Voice：SDK 23 能力边界与验收方案

## 1. 目标与边界

Voice 能力沿用 Agent Bridge V2 的 host、workspace、agent、session、capability gate 和事件生命周期，不建立平行聊天后端。HarmonyOS App 负责录音、播放、音频焦点和用户交互；Bridge 负责语音 Provider 编排、限流、超时、会话状态和临时音频清理。Bridge 默认不拥有本机麦克风或扬声器，只有显式注册平台适配器时才可以宣告 `audioCapture` 或 `audioPlayback`。

当前 R5/R18/R33 源码已完成本地/远程路径解耦：本地 STT 可用时 App 使用 CoreSpeechKit，不创建 Bridge Voice session；本地不可用且远程 capability 可用时才进入 Bridge streaming STT。即使 App 为能力探测初始化了本地识别引擎，`remote_stt` 采集模式也只把 chunk 交给 Bridge，不向 CoreSpeechKit 写入音频或调用本地 finish/cancel；释放阶段仍会清理已初始化的本地引擎。TTS 每次固定选择设备或 Bridge Provider 一路，Bridge 返回的 `audioBase64`、MIME、采样率和声道由 NGF media facade 解码并播放，停止、取消、前后台和中断统一执行幂等资源清理。后台启动录音会稳定返回 `app_background`；麦克风权限执行 check -> request -> re-check，能力快照公开 `microphonePermission` 和 `open_app_permission_settings` remediation；AudioSession snapshot 区分 inactive/active/interrupted，主动释放不会被误报为系统中断。旧 `features.voice` 仍作为兼容汇总值；新 Bridge 通过可选 `voiceCapabilityMatrix` 明确独立远程 STT/TTS 字段的权威性，缺少该标识的旧 Bridge 才按汇总能力兼容降级。源码 smoke、Bridge 全量 check 和 SDK 23 HAP 已通过；真机音频路由、来电/蓝牙和真实 Provider 仍需现场验收。

R118 进一步把 Agent Home 的 TTS 初始化和播放完成回调绑定到 playback generation、hostProfileId 与 connectionEpoch。页面消失、host 切换、用户打断或新一轮播放开始后，旧 `initializeSpeech()`、`speak()` 和 `playAudioBase64()` 回调只会被丢弃，不会在新 host/session 上启动或清除播放状态；该安全门由 `AgentHomeVoicePlaybackCoordinator` 纯逻辑测试和 SDK 23 HAP 构建覆盖。

R153 进一步处理远程 TTS 的兼容双交付：Bridge 保留事件与 RPC response 两条路径，App 将 `clientRequestId`、`ttsRequestId`、envelope request id 按顺序归一为 delivery identity，并在设置播放状态和调用 media facade 前只消费一次。同一 generation/host/epoch 的重复音频不会再次播放；空身份 fail closed，新 generation 不受上一轮影响。

R155 收口压缩音频 AVPlayer 启动状态机：`createAVPlayer` 后在 idle 状态注册 `stateChange`/`error` listener，再设置 `dataSrc`，等待 `initialized` stateChange 后 `prepare()`、`play()`，每个异步阶段用 generation + player 身份 + requestId 复核；`NGFRemotePlayerInitializationGate` 带 10 秒超时且只 settle 一次。release 对称注销 listener、拒绝 gate 唤醒等待者、清零音频缓冲，并且仅当 release generation 仍为当前时才 deactivate AudioSession（旧 release 不停用新播放的会话）。正常 completed 与 PCM/raw `drain()` 完成都会清 `snapshot.ttsRequestId`，App 端 `handleLocalVoiceSnapshot` 才能触发播放协调器 complete 并清除页面 TTS mode。

首版必须区分三类能力：

- `audioCapture` / `audioPlayback`：HarmonyOS AudioKit 提供的本地音频采集与播放。
- `speechToText` / `textToSpeech`：HMS CoreSpeechKit 提供的可选语音引擎，或 Bridge 侧显式配置的语音 Provider。
- `voiceActivityEvents`：识别引擎报告的语音开始/结束事件。SDK 23 没有独立公开的通用 VAD API，不得把简单音量阈值或识别事件包装成“官方 VAD”。

任何不可用能力都返回稳定的 `capability_unavailable`、原因和 remediation。App 可以保留文本聊天，但不得伪造听写、TTS 或 VAD 已可用。Voice Provider endpoint 无论来自环境变量还是进程配置，都必须使用 HTTPS；状态只返回不含 URL/token 的 warning code。

## 2. SDK 23 官方声明核查

当前工程目标为 SDK 23。以下结论来自本机 DevEco Studio SDK 声明，不以页面示例或历史文档代替真实 API。

### 2.1 AudioKit：录音、播放与音频会话

推荐导入：

```typescript
import { audio } from '@kit.AudioKit'
```

声明位置：

- `F:/DevEco Studio/sdk/default/openharmony/ets/kits/@kit.AudioKit.d.ts`
- `F:/DevEco Studio/sdk/default/openharmony/ets/api/@ohos.multimedia.audio.d.ts`

| 能力 | 关键 API | SystemCapability | API 边界 |
|------|----------|------------------|----------|
| 录音 | `audio.createAudioCapturer()`、`AudioCapturer.start/read/stop/release` | `SystemCapability.Multimedia.Audio.Capturer` | since 8；跨平台声明 since 12 |
| 播放 | `audio.createAudioRenderer()`、`AudioRenderer.start/write/drain/stop/release` | `SystemCapability.Multimedia.Audio.Renderer` | since 8；跨平台声明 since 12 |
| 流中断 | `AudioCapturer/AudioRenderer.on('audioInterrupt')` | `SystemCapability.Multimedia.Audio.Interrupt` | Renderer since 9，Capturer since 10 |
| 音频会话 | `audio.getAudioManager().getSessionManager()` | `SystemCapability.Multimedia.Audio.Core` | `AudioSessionManager` since 12 |
| 会话场景与设备变化 | `setAudioSessionScene()`、session/device events | Audio Core / Device | since 20 或 21 |

录音配置使用 `AudioStreamInfo` 和 `AudioCapturerInfo`。语音识别采集优先使用 `SourceType.SOURCE_TYPE_VOICE_RECOGNITION`，语音消息可使用 `SOURCE_TYPE_VOICE_MESSAGE`；实际采样率、声道、采样格式和编码必须与识别引擎协商，不能只在 UI 中记录格式。

播放配置使用 `AudioStreamInfo` 和 `AudioRendererInfo`。语音回复优先使用 `StreamUsage.STREAM_USAGE_VOICE_MESSAGE`；只有实时通话式双向音频才使用 voice communication 场景。
Bridge 远程 PCM/raw 结果的 `sampleBits` 是可选字段，缺省为 16；媒体层只接受 8、16、24、32 位，并映射为 SDK 23 的 `AudioSampleFormat.SAMPLE_FORMAT_U8`、`SAMPLE_FORMAT_S16LE`、`SAMPLE_FORMAT_S24LE`、`SAMPLE_FORMAT_S32LE`。压缩音频仍由 `AVPlayer` 按 MIME 处理，不能把 `sampleBits` 当作压缩流格式声明。

音频焦点由 `AudioSessionManager.activateAudioSession()` / `deactivateAudioSession()` 和流级 `audioInterrupt` 共同处理。来电、其他应用抢占、设备切换或系统强制中断时，平台层根据 `InterruptEvent` 暂停、停止或恢复，不在页面层自行模拟焦点状态。

### 2.2 CoreSpeechKit：STT 与 TTS

推荐导入：

```typescript
import { speechRecognizer, textToSpeech } from '@kit.CoreSpeechKit'
```

声明位置：

- `F:/DevEco Studio/sdk/default/hms/ets/kits/@kit.CoreSpeechKit.d.ts`
- `F:/DevEco Studio/sdk/default/hms/ets/api/@hms.ai.speechRecognizer.d.ts`
- `F:/DevEco Studio/sdk/default/hms/ets/api/@hms.ai.textToSpeech.d.ts`

STT 使用 `SystemCapability.AI.SpeechRecognizer`，since 4.1.0(11)。关键接口包括 `createEngine()`、`setListener()`、`startListening()`、`writeAudio()`、`finish()`、`cancel()`、`isBusy()` 和 `shutdown()`。调用方通过 `Uint8Array` 推送音频；当前声明要求单次 `writeAudio` 的音频数据长度为 640 或 1280。`SpeechRecognitionResult` 提供 `isFinal` 和 `result`，因此协议可以真实区分 partial/final transcript。

TTS 使用 `SystemCapability.AI.TextToSpeech`，since 4.1.0(11)。关键接口包括 `createEngine()`、`setListener()`、`speak()`、`stop()`、`isBusy()`、`shutdown()` 和 voice query。`SpeakListener.onData` 可返回合成后的 `ArrayBuffer` 音频流，既可交由 AudioRenderer 播放，也可按策略交给 Bridge Provider；不得同时启动两条未协调的播放链。

上述 AI syscap 在本机 SDK 的 phone、tablet 和 2in1 HMS device definition 中存在，但编译可见不等于所有设备、地区、账号或服务状态都可用。运行时仍需执行 syscap/engine 初始化检查，并把不支持、服务不可用和引擎忙碌区分为稳定错误类别。

### 2.3 VAD 与 AVSession

SDK 23 未发现独立公开的 `VoiceActivityDetector` 或通用 VAD API。SpeechRecognizer 的 `onEvent` 约定事件码 1 表示音频开始、3 表示音频结束，可映射为识别会话的 `speechStarted` / `speechEnded`，但不能宣称为独立本地 VAD。

`@kit.AVSessionKit` 的 `avSession.createAVSession()`、metadata、playback state 和控制事件用于系统媒体会话、锁屏控制和跨设备媒体控制。它不是录音、STT、TTS 或音频焦点接口，也不能替代 `AudioSessionManager`。Voice 首版不依赖需要 `MANAGE_MEDIA_RESOURCES*` 的全局 AVSession manager API；只有后续需要系统媒体控制面时才增量接入 core AVSession。

## 3. 权限与能力门控

麦克风采集必须在 `entry/src/main/module.json5` 声明 `ohos.permission.MICROPHONE`，提供本地化 reason，并把 `usedScene` 限制为实际使用 Voice 的 UIAbility 和 `inuse` 场景。App 在用户点击录音后再请求运行时权限，不在启动时预申请。

权限状态至少区分：未请求、已授权、拒绝、永久拒绝/需前往设置、系统撤销。当前 facade 将平台可观察结果安全归一化为 `unknown`、`granted`、`denied`，拒绝时返回受控 `open_app_permission_settings` remediation；不会把无法从 SDK 23 结果确认的“永久拒绝”伪装成确定状态。拒绝权限只关闭本地采集入口，不影响文本输入、Bridge 连接和已有会话。

能力发布采用独立 feature/capability：

- `voiceAudioCapture`
- `voiceAudioPlayback`
- `voiceSpeechToText`
- `voiceTextToSpeech`
- `voiceActivityEvents`
- `voiceInterruptionHandling`

App 同时检查 Bridge feature、设备 syscap、权限和当前引擎状态。单一布尔 `voice=true` 不足以表达平台录音可用但 STT Provider 不可用的真实情况。

## 4. 分层与会话状态

```text
Agent Home composer / voice mode
  -> NGF media voice facade
    -> platformOhos AudioCapturer / AudioRenderer / AudioSessionManager
    -> optional CoreSpeechKit STT / TTS adapter
  -> AgentBridgeClient
    -> Voice RPC and event stream
      -> Bridge VoiceManager
        -> configured voice Provider adapter
```

页面层只消费强类型 facade 状态，不直接持有 AudioCapturer、AudioRenderer 或 AI engine。NGF media/platform 层负责权限、session 激活、设备变化、前后台、中断、释放和错误归一化。

Voice session 建议状态为 `idle`、`requestingPermission`、`recording`、`transcribing`、`ready`、`sending`、`speaking`、`interrupted`、`cancelled` 和 `failed`。每个 audio chunk、transcript 和 TTS event 必须绑定 `hostProfileId`、`sessionId`、`voiceSessionId` 和单调序列；旧 host epoch、已取消 session 或乱序重复事件不得更新当前 UI。

## 5. 降级策略

- AudioCapturer 不可用或麦克风未授权：隐藏/禁用录音动作，保留文本输入。
- CoreSpeechKit STT 不可用：如果 Bridge 配置了远端 STT Provider，可在用户明确同意上传音频后使用；否则返回 `capability_unavailable`，不能只保存录音却报告听写成功。
- TTS 不可用：保留文本回答，不自动切换未声明的第三方服务。
- 独立 VAD 不可用：手动按下录音、手动停止仍可用；识别引擎 start/end event 仅作为提示。自动停录必须明确标记来源和超时策略。
- AudioRenderer 或焦点不可用：禁止自动播放，提供文本结果；收到中断后停止写入并等待用户重新播放，不假定系统一定允许自动恢复。
- 弱网或 Bridge 断线：限制内存队列和总音频时长；超过上限后停止采集并提示，不无限缓存麦克风数据。

## 6. 隐私与清理

- 麦克风只能由显式用户操作启动；录音状态必须持续可见，并提供立即取消。
- 原始 PCM、临时编码音频和合成音频默认只存在于内存或应用/Bridge 的受限临时目录，不写入普通 profile、聊天 JSON、日志、doctor、通知或相册。
- 日志只记录 session id 摘要、字节数、时长、格式、状态和错误类别，不记录音频、transcript 正文或 TTS 文本。
- `cancel`、发送完成、TTS 完成、超时、host 切换、页面退出、前后台策略触发、Bridge 断线和 daemon 重启恢复时都必须进入统一 cleanup；后台状态下不允许新建录音会话。
- cleanup 顺序为停止采集/播放、取消识别/合成、注销 listener、释放 engine/renderer/capturer、清空内存 chunk、删除临时文件。重复 cleanup 必须幂等。
- AudioSession 主动 deactivate 与系统 deactivation 事件必须分离；系统中断只对当前存在录音、TTS 或远程播放资源的会话触发一次 cleanup，并公开 interrupted 状态供 UI 处理。
- 崩溃遗留文件在下次启动时按受管目录、owner 和 TTL 清理；不得递归删除 state 未登记的路径。
- 远端 STT/TTS Provider 的保留策略必须通过 capability/status 明确暴露；未知保留策略时 App 必须提示风险，不能默认声称服务端不留存。

## 7. 验收矩阵

| 类别 | 自动化/源码验收 | 真机或现场验收 |
|------|-----------------|----------------|
| 权限 | 未请求、授权、拒绝、永久拒绝、重复请求、feature false | 设置页撤销权限、系统隐私指示、首次授权文案 |
| 录音 | 创建/启动/read/stop/release、chunk seq、大小/时长上限、取消清理 | 安静/噪声、长录音、前后台、锁屏策略 |
| STT | partial/final、640/1280 chunk、busy、超时、cancel、engine unavailable | 支持语言、地区/账号限制、真实识别质量 |
| TTS | speak/stop/onData、播放队列、打断、重复事件、资源释放 | 扬声器/听筒、耳机、蓝牙、音量和长文本 |
| 焦点 | session activate/deactivate、audioInterrupt、设备变化、迟到事件 | 来电、闹钟、其他媒体抢占、拔插耳机 |
| VAD | 无独立 VAD 时稳定降级；识别 start/end event 映射 | 噪声、短停顿、连续讲话、自动停录边界 |
| 网络 | 断线、乱序、重放、背压、队列上限、重连后新 session | Wi-Fi/蜂窝切换、弱网、高延迟 |
| 隐私 | 日志/doctor 脱敏、取消/超时/崩溃遗留清理、路径所有权 | 应用强退、设备重启、存储空间不足 |
| 兼容 | 旧 Bridge、缺字段、单项 capability、未知事件 | 不同 SDK 23 设备型号与系统补丁 |

源码闭环不能替代真机音频路由、来电打断、蓝牙和具体 AI 服务可用性验证。现场失败只重新打开对应平台或 Provider 缺陷，不把不存在的 SDK 能力伪装为已实现。
