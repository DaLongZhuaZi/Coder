# R173：Browser CDP host 重连 nonce 缺陷修复（App R161 同类问题）

日期：2026-08-16
状态：已实测（真实 Bridge 重启场景 + 全量回归 EXIT=0）

## 1. 缺陷发现

Web UI Browser 面板现场验证前发现 `chrome-cdp-field` host 在 Bridge 重启后无法恢复注册：Bridge 日志连续 `upgrade.rejected reason=nonce_replay`（10 分钟防重放 TTL）。根因：`browser-cdp-host.js` 只生成一次 appNonce（`bridgeWebSocketUrl()`），随后交给 `RawWebSocketClient({reconnect: true})`，而客户端内置重连复用同一 URL（同一 nonce）——与 App 端 R161 修复的缺陷完全同类。

## 2. 修复（tools/agent-bridge/src/browser-cdp-host.js，备份 .bak-r173）

- 改为自管理重连：`RawWebSocketClient({reconnect: false})`，`connectBridge()` 每次构建**全新 URL（新 appNonce）**；`close` 事件触发 `scheduleBridgeReconnect()`（250ms 起、指数退避、上限 10s + 抖动）。
- `stop()` 对称清理重连定时器；重连定时器不 unref（长驻 CLI 进程，unref 会导致事件循环空转退出——首轮修复后实测发现并修正）。
- 重连成功后重置 `reconnectAttempts` 并重新 `register()`。

## 3. 现场验证（真实 Bridge 重启）

- 修复前：Bridge 重启后 host 每次重试均 `nonce_replay` 409，10 分钟不可恢复（实测日志 06:28:44-06:29:25 连续拒绝）。
- 修复后：kill Bridge → host 进入退避重试（ECONNREFUSED 循环，进程存活）→ 重启 Bridge → **host 0.3 秒内以新 nonce 重连并重新注册**，全程 0 次 `nonce_replay`；`browser.host.list` 恢复 1 个 host。

## 4. 回归 smoke（check:r173，已接入 postcheck）

`scripts/check-cdp-host-reconnect-nonce-smoke.js`：独立 Bridge A → 创建 workspace（session.create）→ 启动 BrowserCdpHost（fake CDP 端点）→ 断言注册 → kill A、同端口启动 B → 观察者重连后轮询 `browser.host.list`，断言 host 在 20s 内重新注册（修复前必然 nonce_replay 锁死 10 分钟）；退出码 0。

## 4b. Web UI Browser 面板现场（第 23B/23D 项，同轮追加）

- 真实 Chrome 中 Web UI 工作台 Browser Automation 区完整渲染：`browser-section` 可见（feature 门通过），**permission status 展示区（R159 产物）显示真实数据**：`Allowed domains: 127.0.0.1 · Managed download directory: configured · Updated: 2026-08-15T20:05:18.301Z`（无绝对路径，R71 脱敏保持）。
- **Hosts 列表渲染**：`Chromium CDP · win32-cdp · ready · 11 actions · 13 commands · Selected host`——Web UI 消费 `browser.host.list` 并展示 host capability 元数据。
- **经 Web UI 创建页面**：Page URL 输入 `http://127.0.0.1:9333/r163-test-page.html` → 点击 New Page → Bridge `browser.page.list` 新增页面（66DD698E...，URL 正确）——Web UI Browser 控制面端到端（UI→message→Bridge→CDP host→Chrome→页面）真实闭环。

## 5. 附注

- Bridge 心跳：`WS_IDLE_TIMEOUT_MS=45s` + 15s ping；server 侧 `WebSocketConnection.lastSeenAt` 随数据/pong 刷新，健康客户端不会误断。
- 观察到的批量断连（CDP host + 一个 Web UI 标签同时 idleMs≈50.7s）与 headless Chrome 资源/后台节流相关，非本轮修复范围；App/Web UI 自带非阻塞自动重连。
- 本轮未修改 ArkTS/HAP；Bridge 全量 `npm run check`（含 check:r172/r173 postcheck）退出码 0（另行记录）。

## 仍待 FIELD

- 设备端（深度锁屏）：App 面板现场。
- 真实 Codex App Server、真实 Provider quota/账单、真机音频路由、旧 Bridge、真实 GitHub、多 Bridge rolling。