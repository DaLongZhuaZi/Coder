# R109 Voice PCM/raw buffer cleanup

更新时间：2026-08-10

## 范围

本阶段收口远程 TTS PCM/raw 播放完成后的敏感音频缓冲生命周期。此前编码音频路径会在 `releaseRemotePlaybackResources()` 中清零 `remoteAudioBytes`，但 PCM/raw 路径的局部 `decoded` 和写入 renderer 的复制缓冲在成功 `drain()` 后仍可能留在内存中。

## 实现

- `VoicePlatformFacade.playAudioBase64()` 的 PCM/raw 分支将 renderer 写入与 `drain()` 放入 `try/finally`。
- `finally` 同时清零 `new Uint8Array(audioBuffer)` 和局部 `decoded`，覆盖播放成功、写入失败和 drain 失败路径。
- 既有外层 catch 和 `releaseRemotePlaybackResources()` 清理逻辑保持不变，renderer、AudioSession 和编码音频路径继续按原有幂等顺序释放。
- `check-voice-platform-contract-smoke.js` 按 PCM/raw 分支截取源码，断言 `drain()` 后、成功返回前清理两份缓冲，避免只检查文件中任意 `fill(0)` 的弱断言。

## 验证

- `npm run check:voice-platform`：退出码 0，输出 `voice platform contract smoke ok`。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check`：退出码 0，主链和 postcheck 全部通过；Docker runtime 按 opt-in 规则 skipped。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 28 s 479 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,457,721 bytes，SHA-256 `86143C940328ACD75FE717FC7B4500E735C7271B18FA7E9E5A498E256CE4D490`。
- `git diff --check`：无实际空白错误，仅有既有 LF/CRLF 转换提示；新增源码/脚本无尾随空白。

## 边界

本阶段只证明源码层 PCM/raw 缓冲清理和 SDK 23 编译闭环。未安装、启动或测试设备；真实 Provider 音频 profile、真机 AudioKit 路由、权限撤销、耳机/蓝牙、来电抢占、前后台、弱网和长录音仍需现场验收，第 21、33 项继续保持“部分实现”。
