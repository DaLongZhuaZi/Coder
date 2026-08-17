# Agent Bridge Relay 威胁模型与 E2E 协议

## 1. 目标与边界

Relay 为无法直接访问本地 Bridge 的 App 提供出站连接汇合点。Relay 只负责连接登记、目标路由、限流和短期背压，不参与 Agent Bridge RPC 解析，也不得获得 RPC、终端、文件、凭证或工作区内容的明文。

本地 `ws://` / `wss://` 直连继续保留。Relay transport 只替换网络承载，已配对设备的身份签名在 Relay 会话注册前完成连接认证；解密后的数据仍进入同一 Agent Bridge V2 parser、生命周期和 capability gate，不建立平行业务协议。

安全目标：

- Bridge 与 App 双向认证，首次连接必须经过显式配对。
- 每次 transport 连接使用新的临时 ECDH 密钥，长期身份密钥只签名握手。
- RPC 文本帧和 binary frame 使用 AEAD 加密，Relay 无法读取或静默修改。
- 每个方向严格递增序列号，拒绝重复、乱序和跨会话重放。
- 被撤销设备不能建立新会话；既有会话立即失效。
- 队列、单帧、总字节、连接数和空闲时间均有硬上限。

非目标：

- Relay 不隐藏通信双方的 IP、连接时间、流量大小或时序。
- 已解锁 App 或 Bridge 主机被完全控制时，E2E 不防止端点读取明文。
- 首版不在 Relay 保存长期离线消息，也不支持跨设备同步长期私钥。
- 本地直连继续使用 Bridge bearer/bcrypt、Host/TLS 和 App 主机信任记录；Relay 路径不向 broker 发送这些长期凭证，而是使用独立的设备配对与签名认证。

## 2. 信任边界与攻击者

可信组件：

- 用户明确配对的 App 端点。
- 用户控制的 Bridge 进程及其受限身份存储。
- HarmonyOS AssetStore/HUKS 或等价的 App 安全存储。
- Node.js 与 HarmonyOS SDK 提供的 P-256、HKDF-SHA256、HMAC-SHA256 和 AES-GCM 实现。

不可信组件：

- Relay 服务及其运维人员、日志和存储。
- App 与 Relay、Bridge 与 Relay 之间的网络。
- 未配对、已撤销或复制旧握手数据的客户端。
- 向 Relay 发送畸形帧、超大帧、重复帧或制造慢消费者的连接。

攻击者可以观察、丢弃、延迟、复制、乱序和修改 Relay envelope，可以冒充 Relay，也可以主动连接公开 Relay。攻击者不能读取端点安全存储，也不能破解标准密码原语。

## 3. Relay 可见元数据

Relay broker 实现只处理以下 envelope 元数据：

- 协议版本和 envelope 类型。
- 随机 `relayId`、`connectionId`、目标 connection id 和随机 `frameId`。
- 帧到达时间、密文字节数、队列深度、连接/断开原因。
- 心跳、ack 和限流状态。

配对和会话握手在 E2E 会话建立前完成，因此恶意 Relay 或网络攻击者可以观察公开握手材料，包括双方长期公钥、指纹、临时 ECDH 公钥、签名、nonce 和时间戳。这些字段只用于认证与密钥协商，不被视为机密；协议安全性不得依赖隐藏它们。pairing secret 仅通过用户控制的配对通道传递，不能发送给 Relay。

加密业务帧位于 broker 不解析的 opaque `payload` 中，但恶意 Relay 仍可自行检查 payload。因此 E2E envelope 的协议版本、随机 `sessionId`、方向、严格序列号、key epoch、粗粒度 `contentType`（JSON 或 binary）、随机 GCM nonce、AAD、auth tag 和密文长度都属于可见元数据。这些字段不得包含 workspace、agent、terminal、file 或 RPC 类型等业务标识；Relay 可以利用它们和流量时序做连接内关联，但不能据此还原业务内容。

Relay 不得获得：

- pairing secret、Bridge/App 长期私钥、临时 ECDH 私钥或派生会话密钥。
- Agent Bridge request type、session/workspace/agent/terminal/file id。
- bearer、bcrypt 密码、OAuth token、Provider secret 或用户内容。

公开握手材料和加密后的业务 envelope 都放入 opaque `payload`；broker 实现不解析或记录该字段。Relay 日志只记录固定类别、随机连接标识、计数和字节数。恶意 Relay 即使检查或修改 `payload`，也只能观察上述公开材料、E2E 元数据与密文，或导致握手/AEAD 校验失败，不能据此计算会话密钥或读取业务内容。

## 4. 身份与配对

Bridge 和 App 各自维护长期 ECDSA P-256 身份。Bridge 私钥存放在 `<Bridge Home>/security/relay-identity.json`，使用原子写入；POSIX 目录权限为 `0700`、文件权限为 `0600`。App 私钥由 AssetStore/HUKS 或受控 secret-store contract 保存，不进入 preferences、普通 JSON、日志、二维码文件或诊断导出。

配对流程：

1. Bridge 生成至少 32 字节随机 `pairingSecret`、随机 `relayId`、一次性 `offerId` 和短期过期时间。
2. Offer 只公开 Relay URL、`relayId`、Bridge 身份公钥/指纹、`offerId` 和 pairing secret。URL 传递时 secret 必须位于 fragment，浏览器和 Relay HTTP 请求均看不到 fragment。
3. App 校验用户看到的 Bridge 指纹，生成或读取自身长期身份，并发送包含完整 ClientHello 的 HMAC-SHA256 证明。
4. Bridge 以 timing-safe 方式校验 HMAC、offer id、过期时间和一次性消费状态，再保存 App 公钥与设备元数据。
5. 配对完成后立即销毁 pairing secret；重复使用返回 `pairing_consumed`。

后续连接不再使用 pairing secret。双方分别签名 canonical handshake transcript，签名材料绑定协议版本、`relayId`、`sessionId`、双方长期公钥指纹、双方临时 ECDH 公钥、随机 nonce 和时间窗口。

## 5. 会话密钥与加密帧

每次连接双方生成新的 P-256 ECDH 临时密钥对。共享 secret 经 HKDF-SHA256 派生 64 字节：

```text
salt = SHA-256("ngf-relay-hkdf-salt-v1" || relayId ||
              clientNonce || bridgeNonce)
info = "ngf-relay-session-v1" || sessionId ||
       clientIdentityFingerprint || bridgeIdentityFingerprint || keyEpoch
output = HKDF-SHA256(ecdhSecret, salt, info, 64)

appToBridgeKey = output[0..31]
bridgeToAppKey = output[32..63]
```

两个方向的 AES-256-GCM key 绝不互换。每个方向从 `seq=1` 开始，发送方单调递增，接收方只接受 `lastSeq + 1`。每帧使用端点 CSPRNG 生成独立的 96 位 GCM nonce；重连必须更换临时密钥和派生密钥，任何端点都不得在同一方向密钥下复用 nonce。

Canonical AAD：

```text
"ngf-relay-v1\\n" ||
lengthPrefixed(sessionId) || "\\n" ||
lengthPrefixed(direction) || "\\n" ||
seq || "\\n" || keyEpoch || "\\n" ||
lengthPrefixed(contentType)
```

密文 envelope 包含 version、`sessionId`、direction、contentType、seq、keyEpoch、nonce、canonical AAD、ciphertext 和 authTag。任意认证字段修改、错误方向、重复 seq、跳号、旧 session ciphertext 或 GCM 校验失败都必须关闭 E2E session，并返回不包含密码材料的稳定类别。

## 6. 重连、队列与背压

- 每次重连创建新的 `sessionId`、临时 ECDH keypair、nonce 和派生密钥；不得恢复旧 AES key 或 seq。
- Bridge 与 App 只在握手完成后释放业务帧；握手前业务帧计入协议违规。
- Relay 只保留连接期短队列，默认每连接最多 128 帧、8 MiB，总空闲 TTL 45 秒；实现可收紧但不得无限扩大。
- 单个 opaque frame 默认上限 1 MiB。大文件和长终端流必须使用 Agent Bridge 现有分片、ack 和背压，不得将整个文件装入一个 Relay frame。
- 超限时 Relay 返回固定错误/关闭连接，不丢弃队列中间帧后继续传送，因为跳号会被端点视为会话失败。
- 断线后未获端点 ack 的业务操作由上层 `clientMessageId`、terminal seq 和 file-transfer idempotency 处理；Relay 不解释或重放业务请求。

## 7. 撤销、轮换与持久化

Bridge 保存最小设备记录：device id、App 公钥/指纹、显示名、创建/最后连接时间、状态和 key generation。不得保存 App 私钥、pairing secret 或会话密钥。

- `revoke` 是 preview -> confirm 操作。确认后标记设备 revoked、关闭其所有 Relay session，并拒绝新握手。
- Bridge 身份轮换是 preview -> confirm 操作。轮换后旧 Bridge identity 进入 retired，所有现有设备必须重新确认新指纹；现有 session 关闭。
- App 身份轮换需要通过仍有效的旧身份签名或重新配对；不能仅凭 Relay 连接声明新公钥。
- 会话密钥、临时私钥、pairing secret 和未确认 handshake 只保存在内存中，并在完成、超时、失败、撤销或 shutdown 时清零/释放引用。
- Bridge 重启不自动联网；只恢复长期身份和设备撤销状态，不恢复 Relay session 或离线队列。

## 8. 稳定失败类别

对外结果使用以下类别，`message` 与 `remediation` 不包含 secret、私钥、密文或完整内部路径：

- `relay_not_configured`
- `relay_url_invalid`
- `relay_unreachable`
- `relay_protocol_error`
- `relay_backpressure`
- `pairing_required`
- `pairing_expired`
- `pairing_consumed`
- `pairing_proof_invalid`
- `device_revoked`
- `identity_mismatch`
- `handshake_expired`
- `handshake_signature_invalid`
- `key_agreement_failed`
- `ciphertext_invalid`
- `replay_detected`
- `sequence_out_of_order`
- `session_replaced`
- `capability_unavailable`

认证、撤销、重放、限流和身份轮换写入脱敏安全审计。正常密文帧不逐帧写审计，避免建立高精度行为日志。

## 9. 必须保持的安全不变量

自动化和现场验收必须证明：

1. Relay 从任何 payload 都无法得到可识别 RPC 或文件内容。
2. 相同明文在不同 session 或方向产生不同密文，方向 key 不可互换。
3. 修改 envelope/AAD/密文/tag、重复或乱序 seq 均在业务 parser 前被拒绝。
4. pairing offer 过期或消费后不能再次注册设备。
5. 撤销设备无法重连，且其活动 session 被关闭。
6. Relay/Bridge/App 的帧、连接、队列、内存和超时都有上限。
7. Bridge/App 重启后不恢复旧 session key 或自动发送旧队列。
8. 普通 profile、日志、doctor、二维码持久文件和 RPC 响应中不存在长期私钥、pairing secret 或会话密钥。
9. Relay 失败不影响本地直连；feature flag 为 false 时旧 App/Bridge 行为保持不变。

## 10. 现场验收边界

源码自动化覆盖恶意 Relay、MITM transcript 修改、重放、乱序、丢包、慢消费者、撤销、长终端分片和大文件分片。真实公网 Relay、NAT/蜂窝网络切换、前后台恢复、跨区域延迟和设备安全存储仍作为现场验收证据，不替代上述源码测试。
