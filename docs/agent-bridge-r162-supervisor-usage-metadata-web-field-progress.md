# R162：supervisor 模式 Fleet + usage/metadata 生产链 + Web 认证链 现场验证

日期：2026-08-16
状态：已实测（本机 Bridge 0.1.4 + 设备 192.168.5.124:44879 连接保持）

## 1. 第 14 项 Fleet：supervisor 模式完整字段

切 supervisor 模式启动（`node src/supervisor-entrypoint.js`，AGENT_BRIDGE_HOST=0.0.0.0 / PORT=8788 / TOKEN=123456 / MOCK_USAGE_EVENTS=1）：

```
daemon.instance.status →
  instanceId=ins__UFSd3cb1roYlqDO
  generation=1  workerGeneration=1
  supervised=true  workerReady=true
  pid=19872  supervisorPid=19872  workerPid=38656
  bridgeVersion=0.1.4  nodeVersion=v22.23.2
  instanceHealth=healthy  restartCount=0  consecutiveCrashes=0
```

对比直连模式（R161）：supervised=false / generation=0 / supervisorPid=0。**supervisor 生命周期字段（supervised/supervisorPid/workerPid/generation/workerGeneration/restartCount/consecutiveCrashes）真实可用**。设备在 Bridge 重启后自动重连成功（activeConnections=1）—— nonce 刷新修复再次验证。

## 2. 第 22 项 usage 生产链（mock provider 真实事件）

`AGENT_BRIDGE_MOCK_USAGE_EVENTS=1` 下，`session.create`(mock) → `message.send` 触发事件生产：

```
usage.summary.get →
  actual: inputTokens=10 outputTokens=5 totalTokens=15 cost=0.15 USD
  estimated: totalTokens=20
  quotas: remaining=90 limit=100 resetAt=...(60min) source=mock-provider window=session
  compactions: 1 (beforeTokens=200 afterTokens=80 reason=automatic)
  realTokens=15 estimatedTokens=20 realCost=0.15 currency=USD
usage.events.list → 3 条：
  usage actual   id=ses_...:mock-usage:1:actual   tokens=15 cost=0.15 USD
  usage estimated id=ses_...:mock-usage:1:estimated tokens=20
  compaction      id=ses_...:mock-usage:1:compaction
```

**事件生产 → UsageManager 聚合 → RPC 查询的完整闭环现场验证**；币种/数值归一化（R59/R62/R63）与事件幂等 ID（R21）生效。

## 3. 第 22 项 metadata 生产链（mock provider）

```
metadata.generate (kind=sessionTitle, session=mock, agent=mock) →
  preview=true  planId=oRbvxXwL2big8xKVTWEaXNMT
  suggestion="Mock metadata sessionTitle"  alternatives=["Mock alternative sessionTitle"]
  sourceProvider=mock  source=provider  estimatedUsage=true
  warnings=["host_scope_unverified_legacy_client"]
```

四类 metadata 中 sessionTitle 的真实生产→preview 链；scope 校验在 legacy 客户端仍生效。confirm 语义为重新 preview（apply 属 Web/R142 层）。

## 4. 第 34 项 diagnostics 脱敏

```
diagnostics.export (format=json) →
  8 groups: daemon=info provider=warning terminal=ok queue=ok usage=ok
            secureStorage=warning remoteConfig=ok persistence=ok
  sizeBytes=5434
  全文不含: "123456" / "browser-live-token" / "Users\\13359" / "DevEcoStudioProject"
```

R102 统一脱敏在真实 RPC 路径生效：token 与绝对路径均不外泄。

## 5. 第 23B 项 Web UI 认证链

```
POST /web/auth/session (Bearer 123456 + Origin http://127.0.0.1:8788) →
  200 { ok:true, ticket:"<43 chars>", expiresInMs:60000, Set-Cookie: ngf_web_session=... }

原始 WS 握手 GET /ws?webTicket=<ticket>&clientId=wf5&appNonce=... (Origin) →
  HTTP/1.1 101 Switching Protocols
  → bridge.connected 事件 + 完整 serverInfo（serverId=srv_je-yNHB204xxnUNs, protocolVersion=v2, features 全量）
  → server.info 事件
```

Web 静态资源全部 200（/app/app.js 204KB 工作台、styles.css、compatibility.js、terminal-stream-state.js、index.html）。**Web 登录会话 → ticket → WS 升级的数据链路真实可用**（R13 兼容层、R124 生命周期产物）。

注：`websocket-client.js` 的 `connectWebSocket` 带 webTicket 时 401 属测试脚本 URL 构造问题；原始 socket 握手已验证 ticket 链路本身正确。

## 仍待 FIELD（不伪造）

- 真实设备音频路由（录音/播放/蓝牙/来电）。
- 真实 Provider quota 账单（当前 mock/codex 均无 usage endpoint，fail-closed 正确）。
- 多 Bridge rolling、跨平台 daemon 安装/自启/升级回滚。
- 真实 GitHub 账号/权限/资产。
- Web UI 浏览器内完整交互（多标签/长流）。
