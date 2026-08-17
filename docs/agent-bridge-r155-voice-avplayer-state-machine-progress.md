# R155 Voice AVPlayer 状态机收口

日期：2026-08-11
状态：已完成（压缩音频 AVPlayer 启动状态机与迟到回调隔离源码子阶段；第 21、33 项仍为部分实现）

## 目标

按 SDK 23 官方声明与 OpenHarmony 官方文档，把远程 TTS 压缩音频的 AVPlayer 启动顺序修正为：

```
createAVPlayer
-> idle 状态注册 stateChange 和 error listener
-> 设置 dataSrc
-> 等待 initialized stateChange
-> prepare
-> prepared
-> play
-> playing
```

并保证旧 AVPlayer 的任何迟到 stateChange/error 回调、prepare/play Promise 或 DataSource 回调都不能污染新一轮播放；正常 completed 必须清理 `snapshot.ttsRequestId`；release 在初始化等待期间必须唤醒旧等待者且不产生未处理 Promise rejection；PCM/raw AudioRenderer 既有缓冲清理行为不回归。

## 官方依据

- `F:\DevEco Studio\sdk\default\openharmony\ets\api\@ohos.multimedia.media.d.ts`
  - `AVPlayerState = 'idle' | 'initialized' | 'prepared' | 'playing' | 'paused' | 'completed' | 'stopped' | 'released' | 'error'`（1778 行）
  - `OnAVPlayerStateChangeHandle = (state: AVPlayerState, reason: StateChangeReason) => void`（1800 行）
  - AVPlayer 建议注册 `on('stateChange')` 与 `on('error')` 主动获取状态变化（1917-1929 行）
  - `prepare()` 只能在 initialized 状态调用（1932-1935 行）
  - `on('stateChange', ...)`（3040 行）、`off('stateChange', callback?)`（3063 行）
  - `on('error', ErrorCallback)`（3739 行）、`off('error', callback?)`（3762 行）
  - `dataSrc?: AVDataSrcDescriptor`（2672 行）；`AVDataSrcDescriptor.fileSize` 与 `callback(buffer, length, pos?) => number`，返回 -1 表示流结束（4788-4840 行）
- OpenHarmony 官方文档：<https://gitee.com/openharmony/docs/raw/master/zh-cn/application-dev/media/media/using-avplayer-for-playback.md>（idle 注册 listener -> 设置 dataSrc -> initialized -> prepare -> prepared -> play -> playing）

## 已实现

### AVPlayer 状态机与监听顺序

- `VoicePlatformFacade.playAudioBase64()` 压缩路径在 `createAVPlayer()` 返回后、`player.dataSrc` 赋值前注册 `stateChange` 与 `error` listener（player 处于 idle）。
- `stateChange` 回调只从 `initialized` 状态 resolve 初始化 gate；`error` 状态与 `on('error')` 回调都 reject 同一 gate（一次性 settled 守卫保证只 settle 一次）。
- `dataSrc` 后 `await initializationGate.promise`，随后 `prepare()`、`play()`；每个异步阶段之间用 `ensureRemotePlaybackCurrent(player, playbackGeneration, playbackRequestId)` 重新校验 generation + player 身份 + requestId。
- 新增 `NGFRemotePlayerInitializationGate`：带 `REMOTE_PLAYER_INITIALIZE_TIMEOUT_MS=10000` 超时；`settled` 守卫让 resolve/reject 只生效一次，超时定时器在 settle 时清除。

### 迟到回调与新旧播放隔离

- 每次 `playAudioBase64` 递增 `remotePlaybackGeneration` 并生成播放私有 `playbackRequestId`；`snapshot.ttsRequestId` 同步绑定。
- `stateChange`/error/DataSource 回调入口统一检查 `remotePlaybackGeneration === playbackGeneration && remotePlayer === player`，旧播放器的迟到回调直接丢弃。
- DataSource 回调读取本次播放私有的 `playerAudioBytes/playerAudioOffset` 闭包，不读共享 offset；`remoteAudioBytes` 仅作为释放时清零的备份引用。
- 释放（stop/release/新播放覆盖/超时/失败）统一走 `releaseRemotePlaybackResources(releaseGeneration)`：同步置空 player/renderer/callback/gate 槽位并 reject gate、清零音频缓冲，再 `off('stateChange'/'error')` 对称注销、stop/release player 与 renderer；仅当 `remotePlaybackGeneration === releaseGeneration` 时才 deactivate AudioSession，旧 release 不会停用新播放的会话。
- 初始化等待期间的 release 通过 gate reject 唤醒旧等待者；该 rejection 全部落在 `playAudioBase64` 的 try/catch 内，不产生未处理 Promise rejection。

### 完成与状态清理

- AVPlayer 自然 `completed` 走 `finishRemotePlayback`：异步 release 完成后校验 generation 与 player 槽位，再清 `snapshot.ttsRequestId` 并回 IDLE。
- PCM/raw 成功路径（`drain()` 完成后）同样清 `snapshot.ttsRequestId`（本轮审查发现并修复：此前 drain 完成后 `ttsRequestId` 残留，会导致 App 端 `handleLocalVoiceSnapshot` 无法触发 `AgentHomeVoicePlaybackCoordinator.complete`、以及中断判断误判活跃音频）。
- 失败/取消路径继续在 catch 中按 generation 清理 `ttsRequestId` 与 ERROR 状态。
- PCM/raw `write/drain` 的 `try/finally` 缓冲清零（R109 行为）保持不变。

## 审查结论（逐段）

1. 取消：`stopSpeaking`/`stopRemotePlaybackResources` 递增 generation 并 reject gate，旧等待者 catch 后按 generation 不匹配直接返回，不写状态。
2. error/stateChange 双回调：两者都会触发 `finishRemotePlayback`，首次调用同步置空 `remotePlayer` 槽位，第二次调用入口 guard 直接返回，幂等；gate 只 settle 一次。
3. 自然完成：`completed` 清理 `ttsRequestId`（AVPlayer 与 PCM/raw 两条路径都已覆盖）。
4. 超时：gate 超时 reject -> catch -> generation 匹配时释放资源并回 ERROR。
5. 旧 generation：所有入口（stateChange/error/dataSrc/prepare/play 后）都以 generation + player + requestId 三重校验拦截。
6. 新播放覆盖：新 `playAudioBase64` 开头 `stopRemotePlaybackResources` 释放旧播放器并递增 generation，旧路径全部失效。
7. AudioSession 清理：仅当前 generation 的 release 才 deactivate；release()/handleBackground/stopSpeaking 保持既有行为。
8. `snapshot.ttsRequestId` 清理：AVPlayer completed/error、PCM/raw drain 完成、stopSpeaking、catch 失败路径、本地 TTS 完成/停止/错误全部清空。
9. PCM/raw 缓冲清理：R109 的 `try/finally` fill(0) 顺序未回归（smoke 有顺序断言）。

## 自动化证据

- `npm --prefix tools/agent-bridge run check:r155`：退出码 0（node --check + contract smoke，输出 `voice platform contract smoke ok`）。
- `npm --prefix tools/agent-bridge run check:voice-platform`：退出码 0。
- Bridge 全量 `$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm --prefix tools/agent-bridge run check`：退出码 0；`postcheck` 实际执行并通过 `check:r155`（`voice platform contract smoke ok`），Docker runtime 按 opt-in 规则跳过。
- SDK 23 `$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'; & 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；`entry/build/default/outputs/default/entry-default-signed.hap` 于 2026-08-15 12:00:37 生成，大小 `14,540,700` bytes，SHA-256 `F299DCCA8F71EB6C257A8518CE48B708C7BABC8822E4524ECCD5E2D92550BBD4`。仅保留既有 syscap、弃用 API（`AudioRenderer.write`）和异常处理警告。
- `git diff --check`：退出码 0。

smoke 覆盖：监听早于 dataSrc（stateChange/error 均断言）、initialized gate、error listener 对称注销、generation/player/requestId 复核、播放私有 buffer、completion requestId 清理（AVPlayer 与 PCM 两条路径）、旧 release 不停用新 session（releaseGeneration 检查）、gate 一次性 settle、errorCallback reject gate、PCM drain 后清理顺序。

## 未关闭的门

- 真机 AudioKit 路由、权限、蓝牙/耳机、来电抢占、前后台、弱网长录音和真实 STT/TTS Provider 仍为第 21、33 项 FIELD 现场验收。
- 本轮未安装、启动或测试设备。后续如需安装，只允许目标 `5KLBB25A10203862`，且仅安装，不启动、不测试、不读取日志、不操作其他设备。

因此，第 21、33 项继续保持“部分实现”。
