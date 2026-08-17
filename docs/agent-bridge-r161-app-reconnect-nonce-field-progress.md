# R161：App 自动重连 nonce 修复 + 真实现场验证（设备 + 真实 Chrome CDP）

日期：2026-08-16
状态：已实测（本机 + 设备 192.168.5.124:44879 + 真实 Chrome CDP）

## 背景与根因

设备端 App（NGFCoder, com.dlzz.coder）重启后，在 10 分钟内自动重连持续被 Windows Bridge 拒绝：

```
bridge.ws | upgrade.rejected | reason=nonce_replay clientId=harmony-coder-app remote=192.168.5.124:43260
```

根因：`AgentBridgeClient.scheduleReconnect()` 复用 `desiredConfig`（含首次连接使用的 appNonce）发起重连；而 Bridge 的防重放缓存 `validateAndRememberNonce`（TTL 10 分钟）记录同一 `clientId + appNonce` 后拒绝重放。协议要求**每次连接生成新的随机 appNonce**（服务端 remediation：`Generate a new appNonce before reconnecting.`），App 自动重连路径没有遵循。

## 修复

- `entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets`：
  - 新增 `appNonceRefresher: (() => string) | null` 字段与 `setAppNonceRefresher()`。
  - `scheduleReconnect()` 的定时器回调中，非 relay 模式先调用 refresher 生成新 nonce 并更新 `desiredConfig.appNonce`，再 `openSocket`。
  - `clearHandlers()` 对称清理 refresher。
- `entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets`：
  - `bindBridgeHandlersForEpoch()` 注册 refresher：先做 host epoch 校验，通过后 `createBridgeAppNonce()` 生成新 nonce 并同步 `bridgeConnectionAppNonce`（握手 `proof.appNonce` 校验用），返回给 client。
- 备份：`AgentBridgeClient.ets.bak-r161`、`NGFAgentHomePage.ets.bak-r161`。

## 构建证据（本次真实执行）

```
$env:DEVECO_SDK_HOME='F:\DevEco Studio\sdk'
& 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --no-daemon --stacktrace
# BUILD SUCCESSFUL in 1 min 11 s 213 ms，退出码 0
# HAP: entry-default-signed.hap 14,567,353 bytes
# SHA-256: 4F14175E8F28AE94B7A4906E3F43DEC35AA5E4F78CFD0E3E4E29707A6BDAFF49
```

安装：`hdc -t 192.168.5.124:44879 install -r entry-default-signed.hap` → `install bundle successfully`，退出码 0。

## 现场回归证据（设备 192.168.5.124:44879）

1. 正常连接：设备启动后 `bridge.connected`（providers=11, transport=direct），pong 每 30s 往返；屏幕 `NGFCoder / Coder / 1 会话 / 已连接`（截图 r161-screen-5.jpeg）。
2. **自动重连路径验证**（关键）：故意 kill Windows Bridge → 设备进入 `reconnecting in Ns` 自动重连；重启 Bridge 后设备 **3 秒内自动重连成功**（`client.connected remote=192.168.5.124:43304`），**全程无 nonce_replay 拒绝**。修复前同场景必然被拦截 10 分钟。
3. 再次自然断线（03:51:59，Bridge 侧 CDP 验证负载）：`bridge reconnect refreshed appNonce` → 03:52:01 `bridge websocket opened` → `request remote sessions: providerId=codex`，3 秒恢复。修复在真实断线场景再次生效。

## 同期现场验证（其他目标条目）

- 第 22 项 Provider usage gate：`provider.usage.list` (codex) → `ok=false, failureCategory=capability_unavailable, "This provider does not expose usage data."`（fail-closed 生效）。
- 第 22 项 metadata scope gate：`metadata.generate` → `metadata_generation_failed` + warnings `agent_scope_unavailable_legacy_session`/`host_scope_unverified_legacy_client`。
- 第 14 项 Fleet 数据链：`daemon.status` → instanceId/generation/health/workerPid；`daemon.instance.status` → instanceHealth=healthy/bridgeVersion/nodeVersion/platform；`check-daemon-fleet-live-smoke.js` 退出码 0。
- 第 21/33 项 Voice capability：`voice.status` 完整矩阵（fail-closed）；设备 `ohos.permission.MICROPHONE` 已声明。
- 第 16/23D 项真实 Chrome CDP（见下）。

## 真实 Chrome CDP 浏览器自动化现场（第 16/23D 项）

- 启动真实 Chrome headless：CDP 127.0.0.1:9224（Chrome/151.0.7922.138）。
- `BrowserCdpHost` CLI 注册：`chrome-cdp-field/ready/cdp`。
- HTTP RPC 全链：page.create → snapshot(nodeCount=15) → permission.set preview→confirm（初始 `browser_domain_not_allowed` → 授权后成功）→ page.action click preview→confirm→applied=true → navigate → screenshot（真实 example.com 页面，存 r161-real-chrome-shot.png）。
- 验证脚本：`tools/agent-bridge/scripts/check-r161-real-chrome-cdp-field.js`（连接真实 Bridge 的 CDP 适配脚本）；独立 host：`node src/browser-cdp-host.js --bridge-url http://127.0.0.1:8788 --cdp-url http://127.0.0.1:9224 ...`。

## 仍待 FIELD（不伪造）

- 真实设备音频路由（录音/播放、蓝牙/耳机、来电抢占、前后台）—— Voice 第 21/33 项真机音频链。
- 真实 Provider quota/账单（Codex 无 usage endpoint 是正常 fail-closed；配置 usage endpoint 的 Provider 现场）。
- 多 Bridge rolling、跨平台 daemon 安装/自启/升级回滚。
- 真实 GitHub 账号/组织权限/资产服务。
- App UI 面板的完整人工导航验证（菜单弹层自动点击受限于 hdc 注入能力，已用 RPC/数据库证据替代）。
