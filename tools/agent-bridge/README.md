# Agent Bridge Desktop

## 签名远程 Provider 目录

Bridge 通过 `provider.directory.*` 提供手动刷新的签名 Provider 目录。默认使用随发行版内置的 RSA 公钥；私有部署可通过 `AGENT_BRIDGE_PROVIDER_CATALOG_PUBLIC_KEY` 覆盖当前进程的信任根。

受管包必须使用 HTTPS，并声明 `packageFormat`（`zip` 或 `tgz`）、`packageSha256`、`entryPath`、平台、架构、版本和 profile 摘要。包安装到 `<Bridge Home>/providers/<providerId>/<version>/`；不会执行安装脚本、修改 PATH 或申请管理员权限。每个 Provider 保留当前版和上一版用于回滚。

目录 state 使用版本化 ownership 记录，只保存 provider/profile 标识、当前/上一版本、相对入口、摘要、健康状态和 generation。公开 list/status 不返回完整 profile、env、绝对 binary 路径、下载 URL 或 manifest 内部路径。Bridge 启动会离线核对入口、目录摘要、profile ownership、secret/environment 引用和 runtime；异常标记 degraded，不自动联网修复。

```text
ngf-agent-bridge provider directory refresh --url https://example/catalog.json
ngf-agent-bridge provider directory list --query codex
ngf-agent-bridge provider directory install provider-id
ngf-agent-bridge provider directory install provider-id --plan-id PLAN --confirm
ngf-agent-bridge provider directory status provider-id
ngf-agent-bridge provider directory rollback provider-id
ngf-agent-bridge provider directory rollback provider-id --plan-id PLAN --confirm
ngf-agent-bridge provider directory remove provider-id
ngf-agent-bridge provider directory remove provider-id --plan-id PLAN --confirm
```

安装、回滚和删除均采用 preview/confirm；计划使用安全随机 id、短 TTL 和一次性消费，并绑定 Provider、profile、版本、state generation/digest、包/目录摘要、平台和架构。状态变化、重复确认或 Bridge 重启都会使计划失效。激活测试、rollback runtime 或 state 写入失败时恢复旧 profile/runtime/state，并返回结构化 `failureCategory` 与 remediation。

## Provider Profile 安全边界

Provider profile schema v2 将公开配置与 secret 引用分离。`provider.profile.list/status/test`、CLI、MCP、doctor 和 diagnostics 只返回 env key、source、configured、fingerprint、安全存储状态和脱敏诊断，不返回 env value 或 secret alias。App/CLI/MCP 修改环境变量时使用 keep/set/remove 语义；旧 `env` 字段只保留兼容写入能力。

Secret 由独立 `ProviderSecretStore` 管理，Windows 使用 CurrentUser DPAPI；macOS 使用 Keychain，Linux 使用 Secret Service。安全存储不可用时不会回退为新的明文持久化，可改用显式进程环境变量引用。旧版 `profiles.json` 中的明文 env 会在可安全迁移时写入 secret store 并原子升级；不可迁移时 profile 标记 degraded，同时禁止通过 RPC 或日志回显明文。

Agent Bridge Desktop 运行在电脑侧，负责把 HarmonyOS App 的统一会话协议转换成本机 Agent 的实际接口。它默认使用跨平台 Node 启动器，支持 Windows、macOS 和 Linux。

## 生产环境运行

生产环境推荐运行已发布的 npm 包。首次部署执行：

```powershell
npm install -g @dlzz/agent-bridge
ngf-agent-bridge --setup
```

配置完成后，正式启动 Agent Bridge：

```powershell
ngf-agent-bridge
```

上面的命令以前台模式运行。需要 supervisor 守护和异常自动重启时使用：

```powershell
ngf-agent-bridge daemon start
ngf-agent-bridge daemon status
```

如果生产环境直接部署本仓库源码，请进入 `tools/agent-bridge` 目录安装生产依赖并启动：

```powershell
Set-Location .\tools\agent-bridge
npm ci --omit=dev
npm run setup
npm start
```

在 `tools/agent-bridge` 目录中，正确的 npm 启动脚本是 `npm start`，不是 `npm run agent-bridge`。`npm run agent-bridge` 只定义在仓库根目录的 `package.json` 中：

```powershell
# 当前目录为仓库根目录
npm run agent-bridge
```

命令末尾不要附加中文句号 `。`。停止前台服务时按 `Ctrl+C`。

启动器会校验保存的 `connectHost` 是否仍属于当前网卡。网络切换导致旧 IPv4 失效时，会自动选择当前物理网卡地址、修正 `bindHost`、写回 profile 并刷新二维码；Bridge 已在运行时检测到稳定的新地址，也会重新生成二维码并提示 App 重新扫码。显式传入的 `--connect-host` 不会被自动覆盖。

## 安装与启动

Agent Bridge Desktop 已发布到 npm。它是需要在电脑侧长时间存在的工具服务，推荐先全局安装一次：

预算币种在 event、budget 和聚合边界统一 trim/大写；因此 CLI/MCP 传入 `usd` 仍能匹配 Provider 的 `USD` cost 并触发 warning-only 预算告警。缺少币种的 cost 只保留事件级记录，不进入费用汇总或预算 cost 比较。

```bash
npm install -g @dlzz/agent-bridge
```

首次使用先运行交互式配置：

```bash
ngf-agent-bridge --setup
```

完成配置后，之后直接启动常驻桌面连接器：

```bash
ngf-agent-bridge
```

启动后会显示 TUI 风格输出：

- 扫描本机可用 Provider：OpenCode、DevEco Code、MiMo Code、Codex CLI、Claude Code、Antigravity CLI、OpenClaw、Hermes、Mock Provider。
- 用表格显示命令、状态、下一步动作。
- 自动选择可用端口，端口被占用时切换到下一个端口。
- 按保存的配置自动启动 OpenCode-compatible server。
- 生成大尺寸 HTML/PNG/SVG 二维码。
- 打开二维码显示页面，App 可以直接扫码导入连接。
- 启动 Bridge HTTP/WebSocket 服务，并持续显示运行状态。

停止服务时，在终端按 `Ctrl+C`。

如果你正在本仓库内开发 Agent Bridge，也可以在仓库根目录执行：

```bash
npm run agent-bridge
```

## 首次配置流程

首次配置命令：

```bash
ngf-agent-bridge --setup
```

配置向导会：

- 选择中文或英文。
- 列出电脑 IPv4 地址，真机连接时选择局域网 IP。
- 设置 Bridge 端口和 Token。
- 扫描本机 Provider 命令。
- 保存配置到用户目录下的 `.ngf-agent-bridge/profile.json`。
- 生成并打开 App 可扫描的二维码页面。
- 随后进入同一个跨平台桌面启动器。

之后直接运行：

```bash
ngf-agent-bridge
```

## 常用命令

```bash
ngf-agent-bridge
ngf-agent-bridge --setup
ngf-agent-bridge --doctor
ngf-agent-bridge --start opencode
ngf-agent-bridge --start openclaw-gateway,hermes-studio
ngf-agent-bridge --lang zh
ngf-agent-bridge --lang en
ngf-agent-bridge --terminal-qr
ngf-agent-bridge --no-open-qr
```

`--doctor` 只扫描环境并输出 Provider 状态，不启动服务。

仓库开发脚本仍然可用：

```bash
npm run agent-bridge
npm run agent-bridge:setup
npm run agent-bridge:doctor
npm run agent-bridge:start -- --start opencode
```

## 管理 CLI 与远程目标

`ngf-agent-bridge` 的管理命令直接复用 Bridge 协议，可管理 agent、terminal、permit、provider、workspace/worktree、Git/GitHub、notification、MCP、daemon 和 security。常用闭环如下：

```bash
ngf-agent-bridge agent run "fix the tests" --provider-id codex --cwd /workspace
ngf-agent-bridge agent attach <id>                 # 持续输出，Ctrl+C 只脱离
ngf-agent-bridge agent attach <id> --status-only   # 只看 runtime 状态
ngf-agent-bridge agent send <id> "also fix lint"
ngf-agent-bridge agent logs <id> --follow
ngf-agent-bridge agent wait <id> --status idle --timeout-ms 60000

ngf-agent-bridge terminal list
ngf-agent-bridge terminal create --cwd /workspace
ngf-agent-bridge terminal capture <id>
ngf-agent-bridge terminal follow <id>
ngf-agent-bridge terminal rename <id> --name build
ngf-agent-bridge terminal kill <id>

ngf-agent-bridge permit list
ngf-agent-bridge permit approve --request-id <id>
ngf-agent-bridge permit deny --agent-id <id> --all

ngf-agent-bridge provider capabilities
ngf-agent-bridge provider refresh
ngf-agent-bridge provider discover ./providers
ngf-agent-bridge provider import ./providers --confirm

ngf-agent-bridge daemon status
ngf-agent-bridge daemon logs
ngf-agent-bridge daemon doctor --save
```

`agent attach` 会先校验 live runtime，再持续读取 timeline；`agent logs --follow` 可直接跟随 timeline；`terminal follow` 会对 capture snapshot 计算重叠区，避免持久化截断或重连后重复输出。三者都支持 `--interval-ms`、`--timeout-ms`、`--max-polls`、`--json` 和 `--summary`。按 `Ctrl+C` 只结束 CLI 跟随，不停止远端 agent 或 terminal。

Terminal WebSocket 生命周期事件（`terminal.updated`、`terminal.attention`、`terminal.capture.persisted`、`terminal.stream.exit`）只发送给创建该终端的连接或当前已订阅该终端流的连接；内部 owner/subscriber metadata 不会进入公开事件。没有可验证范围的终端事件会被丢弃。daemon 级 `terminal.hook.updated` 仍向已认证连接广播。可运行 `npm run check:terminal-event-scope` 验证双连接隔离与 payload 脱敏。

权限请求支持 permission、question 和 plan 三类路由。未指定 request id 且只有一个匹配项时会自动选择；TTY 中存在多个匹配项时会交互选择；非 TTY 中会返回 `permit_selection_required`，脚本应传 `--request-id`、更窄的 `--agent-id/--kind` 或显式 `--all`。

### 安全与认证

Bridge 支持 bearer token 和 bcrypt 密码两种认证模式。bcrypt 固定使用 cost 12；明文密码只从本机显式环境变量读取并在 CLI 进程内生成 hash，远程 Bridge 只接收 hash：

```bash
NGF_BRIDGE_PASSWORD='use-a-secret-manager-in-production' \
ngf-agent-bridge security auth set --mode bcrypt --password-env NGF_BRIDGE_PASSWORD

# 后续前台启动：密码只保留在 launcher 内存，不写 profile 或二维码文件。
NGF_BRIDGE_PASSWORD='use-a-secret-manager-in-production' \
ngf-agent-bridge --password-env NGF_BRIDGE_PASSWORD --terminal-qr

# 管理已运行的 bcrypt Bridge；当前凭证与要设置的新密码使用不同变量。
NGF_CURRENT_BRIDGE_PASSWORD='current-password' \
NGF_NEXT_BRIDGE_PASSWORD='next-password' \
ngf-agent-bridge security auth set --mode bcrypt \
  --credential-env NGF_CURRENT_BRIDGE_PASSWORD \
  --password-env NGF_NEXT_BRIDGE_PASSWORD

# 认证配置损坏时，在 Bridge 主机本地恢复；不会尝试远程 RPC。
ngf-agent-bridge security auth set --local --mode bearer
```

bcrypt 模式沿用现有 Bearer 凭证通道传输密码，因此非 loopback 网络必须配合 HTTPS/TLS。前台 launcher 禁止通过 `--token` 接受 bcrypt 密码，只从 `--password-env` 指定的环境变量（默认 `AGENT_BRIDGE_PASSWORD`）读取，并在派生 Bridge/Provider 前从环境删除；不会把密码写入 `profile.json` 或 HTML/PNG/SVG 二维码文件。显式 `--terminal-qr` 只把连接凭证短暂显示在当前终端。管理已运行的 bcrypt Bridge 时用 `--credential-env <ENV_NAME>` 提供当前密码；`security auth set --password-env` 只表示要生成的新 hash。bcrypt hash 缺失、格式非法或 cost 不是 12 时认证 fail closed，不会回退 bearer。认证模式切换或 bearer token 轮换会关闭既有 WebSocket，客户端必须使用当前凭证和新的 `appNonce` 重连。

Host allowlist 为空不代表全放行：默认仅接受 `localhost`、`*.localhost` 和 IP 字面量。通过 DNS 名访问时需先用 `security hosts add <hostname>` 显式加入。WebSocket 每次升级必须携带 12-256 字符的 `appNonce`；缺失、非法或 TTL 内重放都会在 `101 Switching Protocols` 前被拒绝。

`security devices/trust/revoke` 管理的是本机设备审计记录，不是客户端私钥证明或双向 TLS。App 对 Bridge 主机身份的信任由 Bridge 签名证明独立校验；传输访问仍依赖 Bridge credential，并在启用时由 TLS 保护。

管理另一个 HTTP(S) Bridge 时可显式指定目标：

```bash
ngf-agent-bridge agent list --daemon-url https://bridge.example:8787 --token "$AGENT_BRIDGE_TOKEN"
ngf-agent-bridge daemon status --host http://192.168.1.23:8787 --token dev-token

AGENT_BRIDGE_CLI_HOST=http://192.168.1.23:8787 \
AGENT_BRIDGE_TOKEN=dev-token \
ngf-agent-bridge agent list
```

凭证选择顺序为 `--token`、`AGENT_BRIDGE_TOKEN`、本机已保存 profile；bcrypt 模式下这些位置承载密码而不是 bearer token。显式远程目标失败时不会回退读取或修改本机 daemon store；鉴权、网络、HTTP 和 Bridge 业务错误都保留结构化 `code/failureCategory/message/remediation/target/httpStatus`。

当前 `--daemon-url` 远程管理目标只接受不带凭证和应用路径的 `http://` 或 `https://` origin。Unix socket、Windows pipe 和 Relay pairing offer 会返回 `remote_target_unsupported`；Relay/E2E 使用独立的 `relay` 命令与 App transport，不会被模拟为 HTTP target。远程 Git diff subscription 需要持久连接，单次 HTTP RPC CLI 会明确返回 `remote_stream_transport_required`，其他 Git 管理命令不受影响。

### Git 高风险操作

`workspace.git.discard`、可能覆盖本地状态的 `workspace.git.pull`、`workspace.git.merge`、force push、branch delete 以及 stash pop/drop 均由 Bridge 强制执行 `preview -> planId -> confirm`。Preview 只读取仓库状态，返回受影响路径、未跟踪路径、目标 ref、remote、ahead/behind、冲突/覆盖风险和 repository snapshot；确认前不会写入 worktree、index 或远端。

```bash
# 默认只生成计划，不修改仓库
ngf-agent-bridge git discard --workspace-id <id> --path src/file.ts --preview
ngf-agent-bridge git pull --workspace-id <id> --preview

# 计划必须来自同一 Bridge、同一 workspace 和未变化的仓库状态
ngf-agent-bridge git pull --workspace-id <id> --plan-id <plan-id> --confirm
```

计划默认短期有效且只能消费一次。HEAD、branch/upstream、index/worktree fingerprint、请求参数或 Bridge 进程变化后，确认返回 `git_plan_stale` 或 `git_plan_expired`，需要重新预览。CLI、MCP 和 App 都复用同一 Bridge plan；旧 Bridge 或 `gitOperationPlans=false` 时 App 隐藏高风险入口，但保留只读、stage/unstage 和普通 commit 能力。force push 固定使用 `--force-with-lease`，不会执行 `--force`。

## 可用参数

```bash
ngf-agent-bridge --connect-host 192.168.1.23
ngf-agent-bridge --bind-host 0.0.0.0
ngf-agent-bridge --port 8787
ngf-agent-bridge --token dev-token
ngf-agent-bridge --daemon-url http://192.168.1.23:8787 --token dev-token
ngf-agent-bridge --host https://bridge.example:8787 --token "$AGENT_BRIDGE_TOKEN"
ngf-agent-bridge --lang zh
ngf-agent-bridge --start opencode,deveco,mimo,openclaw-gateway,hermes-studio
ngf-agent-bridge --no-start-providers
```

参数含义：

- `--connect-host`：写入二维码和 App 的连接地址，真机通常填电脑局域网 IP。
- `--bind-host`：Bridge 实际监听地址，真机调试通常为 `0.0.0.0`。
- `--port`：Bridge 端口。
- `--token`：Bridge Token。
- `--daemon-url`：管理显式 HTTP(S) Bridge target；失败时不回退本地 store。
- `--host`：`--daemon-url` 的别名；`security hosts` 命令中仍表示 allowlist hostname。
- `--lang` / `--language`：TUI 显示语言，支持 `zh` 和 `en`。
- `--start`：强制启动指定本机 server，支持 `opencode`、`deveco`、`mimo`、`openclaw-gateway`、`hermes-studio`。
- `--no-start-providers`：只启动 Bridge，不拉起本机 Agent server。
- `--terminal-qr`：额外输出 ANSI 终端二维码。
- `--no-open-qr`：只生成二维码文件，不自动打开浏览器页面。

## 语言策略

TUI 使用集中式 i18n 资源，当前支持 `zh` 和 `en`。语言选择顺序为：

1. 命令行参数：`--lang zh` / `--lang en`。
2. 已保存配置：`.ngf-agent-bridge/profile.json` 中的 `language`。
3. 环境变量和系统 locale：`AGENT_BRIDGE_LANG`、`LANGUAGE`、`LC_ALL`、`LC_MESSAGES`、`LANG`、Node Intl locale。
4. 默认英文。

中文输出会按 CJK 双宽字符计算表格宽度，避免终端表格错位。

## App 侧连接

1. 打开 App 的 Agent Bridge 连接设置。
2. 点击扫码导入连接。
3. 扫描电脑上自动打开的二维码显示页面。
4. 确认 Bridge 地址和 Token。
5. 点击连接。
6. 在会话里选择需要使用的 Provider。

二维码内容包含 Token，只适合开发期局域网连接。不要把二维码截图公开分享。

## Relay 远程访问与端到端加密

Relay 用于 App 无法直接访问本地 Bridge 的场景。Bridge 和 App 都主动连接同一个 broker；broker 只按随机 `relayId` 和连接 id 转发 opaque frame，不解析 Agent Bridge RPC。业务文本和二进制帧在端点间使用 P-256 ECDH、HKDF-SHA256 与 AES-256-GCM 加密，每次重连都创建新的 session、临时密钥、nonce 和严格递增序列号。

生产 Relay 必须配置 TLS：

```bash
AGENT_BRIDGE_RELAY_HOST=0.0.0.0 \
AGENT_BRIDGE_RELAY_PORT=8788 \
AGENT_BRIDGE_RELAY_TLS_KEY_FILE=/secure/path/relay-key.pem \
AGENT_BRIDGE_RELAY_TLS_CERT_FILE=/secure/path/relay-cert.pem \
node src/relay-server.js
```

`ws://` 只允许显式设置 `AGENT_BRIDGE_RELAY_ALLOW_INSECURE_LOOPBACK=1` 的 loopback 测试。生产 Bridge 只接受不含 credential、query 或 fragment 的 `wss://` URL。

Bridge 侧创建配对 offer：

```bash
ngf-agent-bridge relay pairing start --url wss://relay.example.com/relay --confirm
ngf-agent-bridge relay status
ngf-agent-bridge relay devices --include-revoked
```

返回的 `pairingUri` 含短期一次性 pairing secret，只能通过用户控制的扫码/粘贴通道传给 App，不得写入日志、普通 profile、截图或诊断报告。App 首次完成 HMAC 配对后，把长期私钥保存到 HarmonyOS AssetStore，并只在 host profile 保存 Relay URL、relayId、Bridge 公开身份和指纹；pairing secret 立即从运行时配置清除。后续连接使用设备长期身份签名和新的临时 ECDH 握手，不复用旧 secret 或旧会话密钥。

设备撤销和 Bridge 身份轮换均为 preview -> confirm：

```bash
ngf-agent-bridge relay revoke <device-id>
ngf-agent-bridge relay revoke <device-id> --plan-id <plan-id> --confirm
ngf-agent-bridge relay identity rotate
ngf-agent-bridge relay identity rotate --plan-id <plan-id> --confirm
```

Bridge Relay 私钥位于 `<Bridge Home>/security/relay-identity.json`，不进入普通 `profile.json` 或 `config.json`。Relay 连接只维护受限的连接期队列和背压，不提供永久离线消息；断线后的业务幂等继续由 `clientMessageId`、terminal seq 和 file-transfer id 负责。完整信任边界见 `docs/agent-bridge-relay-threat-model.md`。

## Provider 支持

- `mock`：内置测试 Provider，不依赖外部 Agent。
- `opencode`：连接本机 `opencode serve`。
- `deveco`：连接本机 `deveco serve`。
- `mimo`：连接 MiMo/OpenCode-compatible server。
- `codex`：默认以 `auto` 模式优先调用 `codex app-server` 保持长期 thread；仅在 thread 创建前 App Server 不可用时回退 `codex exec --json`。
- `claude`：调用 `claude -p --verbose --output-format stream-json --include-partial-messages`。
- `antigravity`：保留显式 CLI 配置入口。
- `openclaw`：调用 `openclaw agent --message "<prompt>"`，使用当前工作区作为进程目录。
- `openclaw-gateway`：连接 OpenClaw Gateway，默认 `http://127.0.0.1:18789`，使用 `/v1/models` 和 `/v1/responses` SSE。
- `hermes`：调用 `hermes chat --quiet -q "<prompt>"`，模型与 provider 细分默认交给 Hermes 本地配置。
- `hermes-studio`：连接 Hermes Studio BFF，默认 `http://127.0.0.1:8648`，优先 Socket.IO `/chat-run`，失败时回落到 `POST /api/chat-run/runs`。

OpenCode、DevEco Code、MiMo Code、OpenClaw Gateway、Hermes Studio 这类 server 型 Provider 可以由启动器自动拉起。Codex App Server 在首个 Codex thread 创建时懒启动；Claude、Antigravity、OpenClaw、Hermes 这类 CLI 型 Provider 会在收到消息时由 Bridge 调用。

Codex 运行模式可通过 `AGENT_BRIDGE_CODEX_RUNTIME=auto|app-server|exec` 配置，默认 `auto`。已有 App Server thread 不会静默切换到 exec；Bridge 或 App Server 重启后会按持久化的 thread id 执行 `thread/resume`。

OpenClaw Gateway 与 Hermes Studio 的访问 token 只从环境变量读取，不写入 App 资源或启动 profile：

- OpenClaw Gateway：`AGENT_BRIDGE_OPENCLAW_GATEWAY_TOKEN` 或 `OPENCLAW_GATEWAY_TOKEN`。
- Hermes Studio：`AGENT_BRIDGE_HERMES_STUDIO_TOKEN`、`HERMES_STUDIO_TOKEN` 或 `AUTH_TOKEN`。

## Push Kit 离线通知

Bridge 可登记 HarmonyOS App 提供的 Push Token，并在 agent 请求输入、任务完成等离线通知产生时调用华为 Push REST API。原始 Push Token 只保存在 Bridge 本机运行目录，不通过状态 API 返回；状态结果只包含 token fingerprint。

通知记录按连接声明的 `hostProfileId` 隔离。带 host 的 App/CLI 只会看到并修改该 Host Profile 的 Agent、workspace 和 terminal 通知；`notification.list/read/action/prune` 也由 Bridge 按当前 WebSocket host 强制过滤，跨 host 的状态变更返回 `not_found`。缺少 `hostProfileId` 的旧客户端继续使用兼容的无范围读取行为。内部 automation connection 会按已确认 workspace 转发到真实目标连接，不会把运行时通知写入 `bridge-automation` 伪 host。

Push Kit subscription 复用同一 host scope。带 host 的注册、状态查询和注销只触达当前 Host Profile 的 token；带 host 的通知只会发送到同 host active token，异步 `notification.push.updated` 也只通知同 host 连接。无 host 的旧 notification 继续走 legacy 全部 active token 行为，原始 token 仍不出现在状态 DTO、日志或通知中。

App 侧必须先在 AppGallery Connect 开通 Push 服务，并重新签发包含 Push 权益的签名 Profile。没有对应权益时，App 会保留本地通知能力，但 Push Kit token 获取会返回结构化降级状态。

Bridge 投递配置只从环境变量读取：

- `AGENT_BRIDGE_HUAWEI_PUSH_SERVICE_ACCOUNT`：华为服务账号 JSON 的本机绝对路径，建议放在仓库外并限制文件权限。
- `AGENT_BRIDGE_HUAWEI_PUSH_PROJECT_ID`：Push 项目 ID；未设置时可从服务账号读取。
- `AGENT_BRIDGE_HUAWEI_PUSH_BEARER_TOKEN`：可选的短期 Bearer Token；设置后优先于服务账号换取 token。
- `AGENT_BRIDGE_HUAWEI_PUSH_API_BASE_URL`：可选 API 根地址，默认 `https://push-api.cloud.huawei.com`。
- `AGENT_BRIDGE_HUAWEI_PUSH_CATEGORY`：通知分类，默认 `MARKETING`。
- `AGENT_BRIDGE_HUAWEI_PUSH_TEST_MESSAGE`：是否按测试消息发送，默认关闭。
- `AGENT_BRIDGE_HUAWEI_PUSH_TIMEOUT_MS`：请求超时，默认 15000 毫秒。

`pushKitSubscriptions` 表示 Bridge 可安全保存设备订阅；`pushKitDelivery` 只有在服务账号或 Bearer Token 与 project ID 均可用时才为 true。不要把服务账号、私钥、Push Token 或 Bearer Token 写入仓库。

## 真机局域网连接

真机不能使用 `127.0.0.1` 连接电脑。首次配置时请选择电脑局域网 IP，或显式传入：

```bash
ngf-agent-bridge --connect-host 192.168.1.23 --bind-host 0.0.0.0
```

还需要确认：

- 手机和电脑在同一个局域网。
- 系统防火墙允许 Node.js 或所选端口入站。
- 不要把 `0.0.0.0:<port>` 暴露到公网。

## 健康检查

Bridge 默认健康检查：

```bash
curl http://127.0.0.1:8787/health
```

能力检查：

```bash
curl -H "Authorization: Bearer dev-token" http://127.0.0.1:8787/capabilities
```

如果端口或 Token 来自配置向导，请以 TUI 输出的实际值为准。

## M5 Agent Experience

M5 能力通过 `richContentAst`、`messageQueue`、`usageEvents`、`usageBudgets`、`metadataGeneration`、`diagnosticsExport`、`adaptiveWorkbench`、`commandPalette` 和 `sessionWindows` 等可选 feature flags 发布。旧 Bridge 缺少字段或能力开关为 false 时，App 保留原有文本聊天和导航，不根据缺失字段推测支持情况。

### Rich Content 与消息级 Fork

Bridge 将 Provider 节点和 Bridge 生成内容统一规范化为 canonical AST，支持 `text`、`code`、`link`、`file`、`tool`、`todo`、`diff`、`warning` 和 `fallback`。流式 delta 只更新文本，完整消息合并完成后才生成并持久化 canonical AST，避免单个分片覆盖完整结构。规范化过程限制节点数、UTF-8 字节数、行数和 tokenizer token 数；内置 tokenizer 覆盖 ArkTS/TypeScript/JavaScript、JSON/JSON5、Shell 和 Diff/Patch，未知语言或解析失败时降级为纯文本。

工具卡按 file、shell、Git、GitHub、checkpoint、terminal、permission、plan 和 fallback 分类。外链只接受不含内嵌凭证的 HTTP/HTTPS URL；文件节点必须使用与当前 workspace 匹配的安全相对路径，App 打开前会再次检查路径、workspace 和行号。

消息级 fork 只对具有 durable `boundaryMessageId`、`timelineEpoch` 和 `timelineSeq` 的完成消息开放，并固定执行 preview → confirm。fork plan 绑定源 agent、权威 cursor、`contextDigest`、workspace mode 和有效期；confirm 会拒绝过期、重复使用或状态已变化的 plan。子会话上下文只包含边界前的 user/assistant 消息和脱敏 tool summary，不包含 reasoning、credential、外部工具原始输入或边界后的消息。chat-history attachment 只在 child 首次发送时注入一次，消费状态持久化，支持 shared 与 isolated workspace。

### 队列、Usage、Metadata 与诊断

R29 进一步收紧共享 Usage 持久化入口：token、quota、compaction 只接受非负安全整数，cost 只接受非负有限数；聚合历史事件时重复校验，非法值保持 unavailable。只有 input/output 同时存在时才推导 totalTokens，单侧字段不会被当作完整总量。`check-usage-event-normalization-smoke.js` 已通过 `check:r29` 纳入全量 `postcheck`。

R30 增加 Provider usage freshness：有效 `expiresAt` 已过期或 Provider 显式标记 `stale` 时，结果保留为可读的最后一次快照，但不会写入新的 quota Usage event；App 通过可选 `stale` 字段显示本地化过期状态。旧 Provider/旧 App 缺少该字段时安全默认为 fresh/false。`check-provider-usage-freshness-smoke.js` 已通过 `check:r30` 纳入全量 `postcheck`。

R66 将 Provider usage 结果的作用域改为请求权威：Bridge connection 提供的 host/session/agent/window 会覆盖 Provider 响应中的冲突字段，并返回稳定 `provider_scope_response_ignored` warning；无作用域的旧调用保持兼容，quota event 不会被 Provider 响应搬移到其他 Host。`check-provider-usage-scope-integrity-smoke.js` 已通过 `check:r66` 纳入全量 `postcheck`。

R76 将 producer 侧的 unavailable 语义与 `UsageManager` 对齐：Codex App Server、OpenCode 和 Gateway 只有在 Provider 明确给出 total，或 input/output 两侧同时存在时才输出 `totalTokens`；单侧 token、reasoning/cache-only 数据保持缺失。负数、分数或超出安全范围的 token，以及负数/非有限 cost 会被丢弃；缺少 currency 的 cost 不伪造 `USD`，显式币种统一为大写。现有 provider smoke fixture 显式声明 `USD`，跨 Provider integrity smoke 覆盖单侧、缺币种、多币种、非法整数和全非法事件，并由 `npm run check:r76` 接入全量 `postcheck`。真实 Provider 账单币种、quota 与长会话仍需现场验收。
R79 为 `provider.usage.list` 增加可选 `availabilityState`，状态包括 `unsupported`、`available`、`available-empty`、`failed`、`stale` 和 `loading`。未配置 adapter/endpoint 时返回 `unsupported`，请求或 Provider 错误返回 `failed`，成功但没有套餐窗口/详情时返回 `available-empty`，真实数据返回 `available`，过期快照返回 `stale`；旧客户端继续使用 `status`/`ok`/`stale`。可运行 `npm run check:r79` 验证归一化、错误映射和 App parser/page 接线。

`message.send` 可携带 `clientMessageId`、`composerTokensJson`、`queuePolicy` 和 `forkSourceJson`。Bridge 会重新校验 composer token 的 host/workspace scope 和文件相对路径，并按 `clientMessageId` 持久去重。队列状态为 queued、sending、accepted、failed 或 cancelled，可通过 `message.queue.list/cancel/retry` 管理；App 重连后按同一 client message 合并状态。队列 state schema v2 记录最多 20 条受限 attempt history：首次发送生成 `attemptId`，失败 retry 保留原 queue/client id 并生成新的 attempt，通过 `retryOfAttemptId` 建立关联；旧 v1 状态会在首次读取时幂等迁移，旧 App 缺少新字段时继续使用原 attempts 数字。

Usage 将 actual 与 estimated 分开保存，缺失数值保持 unavailable。token 分类包括 input、output、cache read/write、reasoning 和 total；费用按 currency 分组，不跨币种求和，缺少 currency 的 cost 不进入费用聚合且不生成伪造的 real/estimated cost；币种在聚合边界统一为大写；quota 保留 remaining、limit、resetAt 和 source。budget 按 host、session/agent 及 session/day/month window 隔离，支持 token/cost、currency 和 warning threshold。`usage.budget.warning` 只在阈值跨越时去重告警，不阻止发送或停止 agent；compaction timeline 保留压缩前后 token、原因、估算标记和时间。Codex App Server 会合并 `thread/compacted` 与 `contextCompaction` completed item，顺序无关地只发布一条 compaction usage event；OpenCode `step-finish` 会规范化 token/cost，结构化 `compaction` part 会保留 auto/manual 与 before/after token，两个事件均按 part id 去重；OpenClaw Responses 与 Hermes Studio completion 会规范化 token/cache/reasoning/cost 并按响应 id 去重。Gateway 没有稳定 compaction 事件契约时保持 unavailable。

Usage 事件由 Bridge 按连接的 `hostProfileId` 定向发送：同 host 的多个会话窗口可以同步，其他 host 不会收到。没有 host 标识的旧客户端不会被广播到其他 legacy 连接，但触发事件的来源连接仍可收到自己的 `usage.updated` 或 budget warning。来源连接信息只用于发送路由，不进入持久化 usage state；`check-usage-event-scope-smoke.js` 和 `check-usage-recovery-smoke.js` 已覆盖该边界。

Provider 套餐用量通过只读 `provider.usage.list` 按需查询；成功返回且窗口包含真实 `remaining`、`limit` 或 `resetAt` 时，Bridge 会把 quota snapshot 写入现有 host/session/agent/provider scoped Usage store。snapshot eventId 使用配额内容摘要，同一快照重复刷新不会重复计入，数值或 reset 时间变化才产生新事件，并通过 `usage.updated` 通知同 host 连接。quota 数值只接受非负、有限且不超过安全整数上限的值；负数、Infinity、NaN 和超限值保持 unavailable，不会被夹成 `0` 或写入 Usage store。有效 `expiresAt` 已过期或 Provider 显式标记 `stale` 时，结果仍可作为最后一次只读快照展示，但不会产生新的 quota event；没有 `stale` 字段的旧结果继续兼容。该链路不写入普通 profile、日志或 usage store 中的凭证。Bridge 优先使用当前 Provider 的 `getUsage()` adapter；没有 adapter 时可为 Provider 配置 `usageEndpoint`，或使用 `usageEndpointEnv` 指定环境变量，Codex 的 `AGENT_BRIDGE_CODEX_USAGE_URL` 继续兼容。endpoint 和重定向目标只接受 HTTPS，拒绝 URL 内嵌凭证，最多跟随 3 次重定向，响应体上限为 256 KiB，并按有限超时请求；带认证的请求只允许同 origin 重定向，避免将 Bearer 头发送到另一主机；认证值只从 `usageEndpointTokenEnv` 指定的环境变量读取。未配置或 Provider 不支持，或 Provider 明确返回 unavailable/error/failed 时，均返回 `ok: false` 和准确的 status/failureCategory，不会伪造 quota；HTTP/重定向/JSON/大小错误返回结构化 failure category。进入 RPC/持久化的 Provider plan、details、warnings、message 和 remediation 会做长度限制与 token/private-key 脱敏。Provider descriptor 现在可选发布 `capabilities.providerUsage`：adapter、配置 endpoint 或可用 endpoint 环境变量为 true，未配置为 false；App 对新 descriptor 的显式 false 隐藏刷新入口，旧 Bridge 缺字段继续按全局 feature 兼容。请求 scope（host、session、agent、window）以 Bridge connection 为权威：Provider 缺少回显时补齐，显式冲突时覆盖并返回稳定 `provider_scope_response_ignored` warning；App 仅在 `providerUsage` capability 为 true 时显示 Provider Usage 区域。R78 进一步要求 Registry 只有在 runtime method/producer marker 存在时才发布 `metadataGeneration`/`usageEvents`，并拒绝 HTTP 或嵌入凭证的 usage endpoint；静态 descriptor 不再误报可用。OpenCode 的 `usageEvents` capability 已由 descriptor 宣告并通过 `check-opencode-provider-usage-smoke.js` 覆盖；这不等同于 OpenCode 已提供套餐 quota，缺失套餐数据仍显示 unavailable。
Provider 套餐用量通过只读 `provider.usage.list` 按需查询；成功返回且窗口包含真实 `remaining`、`limit` 或 `resetAt` 时，Bridge 会把 quota snapshot 写入现有 host/session/agent/provider scoped Usage store。snapshot eventId 使用配额内容摘要，同一快照重复刷新不会重复计入，数值或 reset 时间变化才产生新事件，并通过 `usage.updated` 通知同 host 连接。quota 数值只接受非负、有限且不超过安全整数上限的值；负数、Infinity、NaN 和超限值保持 unavailable，不会被夹成 `0` 或写入 Usage store。该链路不写入普通 profile、日志或 usage store 中的凭证。Bridge 优先使用当前 Provider 的 `getUsage()` adapter；没有 adapter 时可为 Provider 配置 `usageEndpoint`，或使用 `usageEndpointEnv` 指定环境变量，Codex 的 `AGENT_BRIDGE_CODEX_USAGE_URL` 继续兼容。endpoint 和重定向目标只接受 HTTPS，拒绝 URL 内嵌凭证，最多跟随 3 次重定向，响应体上限为 256 KiB，并按有限超时请求；带认证的请求只允许同 origin 重定向，避免将 Bearer 头发送到另一主机；认证值只从 `usageEndpointTokenEnv` 指定的环境变量读取。未配置或 Provider 不支持，或 Provider 明确返回 unavailable/error/failed 时，均返回 `ok: false` 和准确的 status/failureCategory，不会伪造 quota；HTTP/重定向/JSON/大小错误返回结构化 failure category。进入 RPC/持久化的 Provider plan、details、warnings、message 和 remediation 会做长度限制与 token/private-key 脱敏。请求 scope（host、session、agent、window）会在 Provider 未回显时由 Bridge 安全补齐，App 仅在 `providerUsage` capability 为 true 时显示 Provider Usage 区域。OpenCode 的 `usageEvents` capability 已由 descriptor 宣告并通过 `check-opencode-provider-usage-smoke.js` 覆盖；这不等同于 OpenCode 已提供套餐 quota，缺失套餐数据仍显示 unavailable。R28 live smoke 进一步验证了显式测试开关下 actual/estimated/quota/compaction 事件、session Agent 补齐、budget warning、四种 metadata 及断线重连后的 host 隔离恢复。

```bash
ngf-agent-bridge provider usage codex --session-id <id> --agent-id <id> --window session
```

CLI 和 MCP 的 `provider usage`/`provider_usage_list` 是只读操作；真实套餐数据需要由 Provider endpoint 或 adapter 提供，OAuth/token 等凭证不得通过命令参数传入或返回。

R12 scope 与 quota endpoint 定向验证：

```bash
npm run check:r12
```

该 smoke 只验证 Bridge scope、白名单、脱敏、HTTPS endpoint、重定向和结构化失败，不代表真实 Provider 套餐或长会话现场通过。

`metadata.generate` 只调用当前会话 Provider 的独立 metadata turn，返回可编辑 preview，不写主 timeline，也不直接执行 branch、commit 或 PR 操作。Bridge 先校验 session、agent、provider、providerSession、workspace 和当前连接 hostProfileId，再以白名单 payload 调用 Provider；workspacePath 取受管 Agent scope，timeline/diff 摘要限制大小并脱敏 token、password、secret、authorization 和 private key。显式未知 kind 会以 `metadata_kind_invalid` 阻断，缺失 kind 继续兼容 `sessionTitle`；`normalizeMetadataResult()` 统一清理控制字符、限制 suggestion/alternative/warning 的 UTF-8 大小和数量、去重并在截断时返回 `metadata_result_truncated` warning。结构化 Provider 结果会保留 suggestion、最多五条去重 alternatives、warnings 和 estimatedUsage；旧字符串 Provider 继续兼容。Provider 异常只返回稳定 failureCategory 和受控 remediation，不回显原始错误。旧 session/旧客户端缺少关联字段时只返回明确 warning，不把原始 payload 直接下传。每次请求都有连接级 `requestId`，可通过可选 `timeoutMs` 控制上限；`metadata.generate.cancel` 只允许同一连接且 scope 匹配的请求取消，超时/取消/断开都会清理 pending 并丢弃迟到结果。CLI 支持 `metadata sessionTitle|branchName|commitMessage|pullRequest`、`--timeout-ms` 和 `metadata cancel`；MCP 暴露同名 cancel 工具，但不返回 token。App 同时检查 Bridge `metadataGeneration` 和 Provider descriptor 的 `capabilities.metadataGeneration`；旧 Bridge 或不支持当前 Provider 时隐藏生成入口。`diagnostics.export` 生成版本化 JSON 或 text 报告，固定覆盖 daemon、provider、terminal、queue、usage、secureStorage、remoteConfig、persistence 八组诊断；报告使用 allowlist 与统一脱敏，大小超限时返回 `truncated`。`serverInfo.compatibility` 同时携带 App/Bridge 版本和协议 minimum/recommended/supported 摘要；协议支持列表缺失时 Bridge 只按同一协议族数字后缀校验 minimum，客户端协议缺失或族不一致返回 `unknown`，不会把旧字段缺失误报为兼容；App 运行时版本只来自构建 `versionName`，连接模型、hello、Push 注册和会话子窗口不再使用 `1.0.0` 伪造缺失版本；Bridge 的 `minimumAppVersion` 仍是兼容基线默认值。旧 Bridge 缺字段时 App 使用 unknown/空列表安全降级。Remediation 只暴露受控 `actionId`，App 不执行服务端下发命令。

### App 工作台与会话窗口

自适应工作台按根窗口实际宽度使用 compact（`<720 vp`）、medium（`720–1199 vp`）和 expanded（`>=1200 vp`）布局；能力关闭时继续使用旧导航。菜单、命令面板和快捷键共用 command registry，危险命令只进入既有 preview/confirm。可见范围刷新只选择 chat、workspace、files、changes、terminal、doctor 或 details 中的一项；同 scope 在途请求合并，并以 host profile 和 host epoch 拒绝旧响应，不触发 Provider 扫描、远程目录刷新或其他 host。

会话子窗口使用专用 `NGFAgentSessionWindowPage`。窗口 LocalStorage 只传 `hostProfileId`、`workspaceId`、`agentId`、`sessionId` 和 `instanceId`，凭证由 controller 根据 host profile alias 从安全存储解析。子窗口只请求目标会话的 messages、queue、usage 和 terminal；同一会话复用现有窗口，不同会话可以并存。关闭窗口只释放 client、watch、timer 和 UI 订阅，不停止 agent；窗口登记仅保存在内存中，App 重启后不自动恢复。

## Daemon 管理与系统自启

Bridge 提供本地 daemon 生命周期、日志、诊断和当前用户级系统自启管理：

```bash
ngf-agent-bridge daemon status
ngf-agent-bridge daemon health
ngf-agent-bridge daemon start
ngf-agent-bridge daemon stop
ngf-agent-bridge daemon restart
ngf-agent-bridge daemon logs --max-bytes 65536
ngf-agent-bridge daemon doctor --save

ngf-agent-bridge daemon autostart status
ngf-agent-bridge daemon autostart preview
ngf-agent-bridge daemon autostart install --confirm
ngf-agent-bridge daemon autostart uninstall --confirm
```

`preview` 只返回计划写入的 runner、系统注册项和命令，不修改操作系统。`install` 与 `uninstall` 必须显式传入 `--confirm`；App 和 MCP 调用遵循相同确认边界。

`daemon start` 启动的是 supervisor + worker 两层进程，而不是单个无人看护的 Bridge 进程。Supervisor 使用 owner lock 防止同一运行目录重复启动，持续检查 worker 的 IPC ready/heartbeat，并在异常退出或心跳超时时按指数退避重启。短时间连续崩溃达到阈值后会进入 crash-loop fuse，不再无限拉起；修复 worker 错误后可通过 `daemon start` 重新启动。`daemon status` / `daemon health` 会返回 supervisor/worker PID、generation、最近心跳、重启次数、退避时间与 crash-loop 诊断。公开响应中的 `configPath`/`logPath` 仅是 `.agent-bridge/config.json` 与 `.agent-bridge/logs/daemon.log` 稳定 marker，不暴露本机 Bridge home；`managedProcesses` 只保留进程标识、Provider/kind、PID/存活状态、受控 owner 摘要和时间，绝不返回 command、args、cwd 或完整 identity。`daemon logs` 内部仍从受管日志文件读取，但返回同一 log marker，底层文件系统错误转换为稳定 warning。可运行 `node scripts/check-daemon-public-surface-smoke.js` 验证该公开边界。
`daemon status` / `daemon health` 中的 `update` 以及独立 `daemon update status` 也只返回版本、完整性、pending/replacement 等 allowlist 字段；`statePath`、`stagedPath`、`backupPath` 和 development root 使用固定 marker，saved update state 中的 command、args、cwd、环境和凭证字段不会进入 RPC。

`daemon restart` 会优先通知当前 supervisor 平滑替换 worker；`daemon stop` 会先停止 worker，再释放 supervisor owner lock。更新后的 supervisor 替换也沿用同一锁交接机制，避免旧、新版本同时拥有运行目录。

当前 `--method auto` 会按平台选择：

- Windows：创建当前用户登录触发的 Task Scheduler 任务，使用 `LIMITED` 权限运行。
- Linux：创建并启用 systemd user service，配置 `Restart=on-failure`。
- macOS：创建 LaunchAgent，并通过 `launchctl bootstrap` 立即加载；status 使用 `launchctl print` 查询真实加载状态。

自启管理器只覆盖或删除带 Bridge 受管标记的 runner、unit/plist 和指向该 runner 的 Windows 任务。替换已有受管注册项前会保存备份；安装或卸载失败时会尝试恢复原文件和 OS 注册。发现同名但非 Bridge 管理的任务、service 或 LaunchAgent 时会拒绝操作。自启配置不会保存 Token、证书、密码，也不会修改 shell profile。

## Daemon 安全自更新

Bridge 的自更新只面向可识别的 npm 全局安装。源码 checkout 应继续通过 Git 和项目依赖管理更新，默认不会被自更新流程覆盖。

```bash
ngf-agent-bridge daemon update status
ngf-agent-bridge daemon update check --channel latest
ngf-agent-bridge daemon update preview --channel latest
ngf-agent-bridge daemon update install --confirm
ngf-agent-bridge daemon update rollback --confirm
```

- `status` 只读取本地更新状态；`updaterAvailable` 表示更新机制可用，`available` 只在最近一次检查确实发现更高版本时为 true。
- `check` 从配置的 npm registry 读取目标版本与 integrity；`preview` 额外展示下载、备份和安装计划，但不下载、不安装、不写入全局包。
- `install` 与 `rollback` 都必须显式传入 `--confirm`。安装相同版本或降级还需要显式 `--force`。
- Registry 和 tarball 必须使用 HTTPS；仅自动 smoke 使用 loopback HTTP mock server。包名固定校验为 `@dlzz/agent-bridge`。
- 下载完成后会校验 npm integrity，并检查 tarball 内的 package identity、路径和链接安全。校验失败时不会执行 npm 安装。
- 安装前先用 `npm pack` 创建当前版本回滚包并保存 SHA-512。手工 rollback 会再次验证备份 hash 与 package identity；被篡改的备份会在 npm 执行前被拒绝。
- 新版本安装或版本验证失败时会自动尝试恢复已验证的旧版本备份。
- npm lifecycle scripts 默认通过 `--ignore-scripts` 禁用。CLI 只有显式传入 `--allow-scripts` 才会允许执行目标包脚本。
- 安装或回滚验证成功后，运行中的 Bridge 会请求 supervisor 切换到已安装包中的新 supervisor/worker；状态中的 `pendingRestart` 会在新版本进程确认激活后清除。

在源码 checkout 中，install/rollback 默认返回 `development_checkout`。CLI 的 `--allow-development-install` 只用于隔离测试环境，App 与 MCP 不暴露该覆盖选项；日常开发应使用源码控制更新。

更新 registry 可通过 `AGENT_BRIDGE_UPDATE_REGISTRY_URL` 指定，但 URL 中不得包含凭证。Bridge 不保存 npm token、证书或 registry 登录信息，认证完全交给本机 npm 环境。

## 终端活动与 Attention

Bridge 会跟踪每个终端的活动状态（`unknown` / `working` / `idle`），并在以下情况广播 `terminal.attention` 事件（reason 为 `finished` 或 `needs_input`）：

- 一段持续 8 秒以上的输出流静默下来（长任务跑完）。
- 终端进程在用户近期没有输入的情况下退出（后台任务结束）。
- 终端内进程通过活动上报端点显式上报。

客户端输入或重新订阅终端会自动清除 attention。`terminal.list` / `terminal.updated` 中的终端对象新增 `activity`、`requiresAttention`、`attentionReason`、`attentionAt` 字段。

终端内进程（例如 agent CLI hook）可通过环境变量自行上报活动：

- `NGF_BRIDGE_TERMINAL_ID` — 当前终端 ID。
- `NGF_BRIDGE_ACTIVITY_URL` — 上报端点（`POST /terminal-activity`）。
- `NGF_BRIDGE_ACTIVITY_TOKEN` — 作用域限定的上报令牌，放在 `x-activity-token` 请求头。

```bash
curl -X POST "$NGF_BRIDGE_ACTIVITY_URL" \
  -H "x-activity-token: $NGF_BRIDGE_ACTIVITY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"terminalId\":\"$NGF_BRIDGE_TERMINAL_ID\",\"state\":\"idle\",\"reason\":\"finished\"}"
```

`state` 取 `working`/`idle`；`reason` 可选，取 `finished`/`needs_input`（会触发 attention）。

另外支持二进制 `SNAPSHOT (0x04)` 帧：客户端在已订阅的 slot 上发送空 SNAPSHOT 帧，服务端会以 SNAPSHOT 帧回传当前捕获缓冲（断线重连后整块替换本地缓冲，替代增量重放）。

终端默认 shell 可用环境变量覆盖：`AGENT_BRIDGE_TERMINAL_SHELL`（如 `pwsh.exe`）与 `AGENT_BRIDGE_TERMINAL_SHELL_ARGS`（空格分隔参数）。

## npm 包形态

当前电脑端包已发布到 npm：

```bash
npm view @dlzz/agent-bridge version
```

包名是 `@dlzz/agent-bridge`，`bin` 入口是 `ngf-agent-bridge`。面向普通用户的推荐方式是全局安装后长期使用固定命令启动：

```bash
npm install -g @dlzz/agent-bridge
ngf-agent-bridge --setup
ngf-agent-bridge
ngf-agent-bridge --lang zh
```

如果只想作为项目依赖安装，可以在项目脚本中固定调用 `ngf-agent-bridge`：

```bash
npm install @dlzz/agent-bridge
node ./node_modules/@dlzz/agent-bridge/src/desktop-launcher.js --setup
node ./node_modules/@dlzz/agent-bridge/src/desktop-launcher.js
```

## 维护者发布流程

电脑端包已经是公共 npm 包。后续版本发布前需要确认：

- 当前包名仍为 `@dlzz/agent-bridge`，发布账号拥有 npm 上的 `dlzz` scope。
- `package.json` 中 `private` 为 `false`。
- `publishConfig.access` 为 `public`。
- `bin.ngf-agent-bridge` 指向 `src/desktop-launcher.js`。
- `files` 至少包含 `src` 和 `README.md`。
- README、LICENSE、版本号和仓库地址准备好。

发布检查：

```bash
cd tools/agent-bridge
npm login --registry https://registry.npmjs.org/
npm whoami --registry https://registry.npmjs.org/
npm pack --dry-run
```

发新版本：

```bash
cd tools/agent-bridge
npm version patch
npm publish --access public --registry https://registry.npmjs.org/
```

## GitHub OAuth 与完整 PR 工作流

- `AGENT_BRIDGE_GITHUB_CLIENT_ID` 配置 OAuth Device Flow 的公开 client id，不需要分发 client secret。
- OAuth token 使用 Windows DPAPI、macOS Keychain 或 Linux Secret Service；安全存储不可用时只允许继续使用 `GITHUB_TOKEN`，不会持久化明文 token。
- credential store 的 Keychain/Secret Service/DPAPI 命令执行带超时和输出上限，并检查退出状态；OAuth token 只通过进程 stdin 传递，Windows 凭证文件原子写入，账号标识拒绝路径穿越。
- Device Flow 的过期、授权拒绝、token/账号校验失败和安全存储失败会清理临时授权 session；`authorization_pending` 与 `slow_down` 按 GitHub 返回的间隔继续轮询。
- 支持账号状态、host/workspace 仓库绑定、PR 分页、draft/ready、reviewer、label、checks、合并和按需 watch。
- WebSocket 连接的 `clientHello.hostProfileId` 是 GitHub 请求的权威范围；同一 Bridge 上不同 Host Profile 的 binding、一次性 plan 和 watch 不会互相消费或接收事件。PR update/reviewer/label/merge plan 创建时保存该 host，confirm 会再次校验；连接关闭时，该连接创建的 watch subscriber 会被清理，避免遗留轮询。
- PR 修改、绑定、合并和附件均采用 preview/planId → confirm。
- 附件上传器通过 `AGENT_BRIDGE_GITHUB_ASSET_UPLOAD_URL` 配置 HTTPS endpoint，可选使用 `AGENT_BRIDGE_GITHUB_ASSET_TOKEN_ENV` 和 `AGENT_BRIDGE_GITHUB_ASSET_MAX_BYTES`；上传后由 Bridge 创建 issue/PR comment。

```text
ngf-agent-bridge github auth start
ngf-agent-bridge github auth poll --session-id <id>
ngf-agent-bridge github pr list --workspace-path <path> --page 1
ngf-agent-bridge github pr update --number 42 --title "New title"
ngf-agent-bridge github pr update --number 42 --plan-id <id> --confirm
ngf-agent-bridge github attachment preview --number 42 --file <workspace-file>
ngf-agent-bridge github attachment upload --plan-id <id> --confirm
```

## Daemon 远程配置与实例身份

- `daemon instance status` 返回稳定 `instanceId`、supervisor generation、平台/版本、heartbeat、能力和远程配置摘要。
- 远程配置只接受签名、无嵌入凭证的 HTTPS JSON URL；HTTP、用户名/密码、fragment、控制字符和不安全重定向都会被拒绝。默认使用发行版内置公钥；`AGENT_BRIDGE_REMOTE_CONFIG_PUBLIC_KEY` 可在私有部署或开发环境覆盖。
- 远程配置禁止 token、password、secret、private key、credential 和环境变量内容，只能提供非敏感默认值。
- schema v1 会校验版本、scope、priority、values 深度/数量/字符串限制和签名编码；未知顶层字段保留但返回 `unknown_fields_ignored` warning。
- Bridge 启动只验证并加载上次已应用状态，不自动联网；active/previous/fetched 状态的摘要、签名或来源 URL 损坏会标记 `degraded`，不会静默回滚或联网修复。
- `validate`、`preview`、`apply` 会重新计算 fetched digest；rollback 在切换前重新验证 previous。写入 Bridge Home 失败时返回 `state_persist_failed`，不会消费 plan 或报告为成功。
- apply 与 rollback 都执行 preview → planId → confirm，且 plan 绑定当前 WebSocket hostProfileId、instanceId、generation、source URL、configVersion 和 digest。连接声明的 `clientHello.hostProfileId` 是 daemon config 的权威 host scope；跨 host confirm 返回 `host_scope_mismatch`，配置来源或版本变化后旧 plan 返回 `plan_expired`。
- HarmonyOS App 的 Daemon 设置区在 `remoteDaemonConfig` capability 开启时展示 active/previous/fetched 版本、摘要验证、degraded 状态和重启要求；status/validate/preview/rollback 按当前 host profile 发送，apply/rollback 只能从预览对话框确认。界面只显示来源是否已配置，不回显远程 URL 或查询参数；成功切换后自动刷新状态。
- 管理 CLI 的 `daemon config status/fetch/validate/preview/apply/rollback` 只通过 live Bridge RPC 执行；没有运行中的 Bridge 时返回 `live_bridge_required`，不会旁路修改本地 remote-config store。Bridge 结构化失败保留 `failureCategory`、`message` 和 `remediation`，CLI 以非零退出码结束。
- MCP 暴露同名 `daemon_config_*` 工具并复用公共 RequestType：status/validate/preview 是只读，fetch 是 open-world，apply/rollback 是 destructive；apply/rollback 缺少 `confirm=true` 时在 MCP stdio 层阻断，不触达 Bridge。

```text
ngf-agent-bridge daemon instance status
ngf-agent-bridge daemon config fetch --url https://config.example/bridge.json
ngf-agent-bridge daemon config validate
ngf-agent-bridge daemon config preview
ngf-agent-bridge daemon config apply --plan-id <id> --confirm
ngf-agent-bridge daemon config rollback
ngf-agent-bridge daemon config rollback --plan-id <id> --confirm
```

远程配置安全边界的定向回归：

```bash
npm run check:r32
npm run check:daemon-remote-config-host-scope-live
```

CLI/MCP live 回归：

```bash
node scripts/check-management-cli-live-smoke.js
node scripts/check-mcp-live-smoke.js
```

多 host Fleet 编排由 HarmonyOS App 负责：App 使用 host profile 安全凭证分别直连各 Bridge，聚合 `instanceId`、generation、health、Bridge/config 版本和 heartbeat，并按 preview → confirm 串行执行 restart/update/rollback。Bridge 不保存其他实例凭证，也不提供中心 controller；因此 `serverInfo.features.daemonFleetOrchestration` 固定为 `false`，`daemonFleetTarget` 仅表示当前实例可作为 App rolling target。旧 Bridge 缺少 `instanceId` 时只能只读展示，跨平台全局安装、自启重启和多 Bridge rolling 仍需现场验收。

Fleet 面板可见性由 HarmonyOS App 本地 policy 决定（`AgentHomeDaemonFleetAvailabilityPolicy`）：只依据 App 本地编排能力与已保存 host profiles，不依赖当前活动 Bridge 的 `daemonInstanceIdentity/daemonFleetTarget` capability；每个目标仍须自身发布 `daemonFleetTarget=true` 且具备实例身份才能进入 rolling target，collect 结果写入前按 hostProfileId 集合与 host epoch 校验，迟到批次不会覆盖当前快照。 Rolling replacement 在 generation 增长且 health 为 healthy 后还必须满足计划中的 Bridge/config 版本：restart 校验当前版本，update 校验目标版本，漂移返回 `daemon_version_mismatch` 或 `daemon_config_version_mismatch`。

## Schedules、Loops 与 Chat Rooms

Bridge 将三类自动化状态保存在 Bridge Home 下的独立版本化 store 中，启动时只恢复已验证的本地状态，不依赖 App 常驻。所有高风险修改均执行 preview → `planId` → confirm；CLI 和 MCP 不会在没有 live Bridge 时旁路直接写 store。

Schedules 支持五段 cron、IANA timezone、DST 不存在/重复本地分钟、`skip/run_once/catch_up` missed-run、单实例 lease、并发 `skip/queue`、重试退避、history retention 和 run-now。调度执行复用 Provider session 与 Agent Manager。

```text
ngf-agent-bridge schedule status
ngf-agent-bridge schedule list
ngf-agent-bridge schedule create --name "Nightly review" --prompt "Review the workspace" --cwd <path> --provider codex --cron "0 9 * * *" --timezone Asia/Hong_Kong
ngf-agent-bridge schedule create --plan-id <id> --confirm
ngf-agent-bridge schedule run-now --id <schedule-id>
ngf-agent-bridge schedule run-now --id <schedule-id> --plan-id <id> --confirm
ngf-agent-bridge schedule history --id <schedule-id>
```

Loops 使用独立 worker/verifier Agent，verifier 必须返回覆盖全部 acceptance criteria 的结构化 `passed/checks/remediation`。支持最大轮次、token/cost/currency/duration budget、shared/isolated workspace、pause/resume/stop/takeover 和 daemon 重启后显式继续。

```text
ngf-agent-bridge loop create --prompt "Implement the change" --verify-prompt "Verify it" --criterion "Targeted tests pass" --cwd <path> --max-rounds 5
ngf-agent-bridge loop create --plan-id <id> --confirm
ngf-agent-bridge loop start --id <loop-id>
ngf-agent-bridge loop start --id <loop-id> --plan-id <id> --confirm
ngf-agent-bridge loop pause --id <loop-id>
ngf-agent-bridge loop resume --id <loop-id>
ngf-agent-bridge loop rounds --id <loop-id>
```

Chat Rooms 支持 room/member/message/thread/mention/role、稳定 seq、`clientMessageId` 幂等、ack、前后分页和归档只读。Agent 只响应显式 mention，单条消息最多 fan-out 5 个 Agent；Agent 响应不会继续 fan-out，避免自动回环。

三类 lifecycle event（`schedule.updated`、`loop.updated`、`chat.room.updated` 及其 run/message/ack 子事件）不会全局广播。连接只有在成功 list/get/history/rounds 或写操作结果中读取到对应实体后，才建立运行期实体/workspace 订阅；事件缺少匹配 scope 时会被丢弃。WebSocket 断开会清理订阅，重连后必须重新读取。可运行 `npm run check:automation-event-scope` 验证双连接隔离、未知 scope 阻断和断开清理。

自动化创建的 Agent/session Provider runtime event 同样按 workspace scope 单播：`automationConnection` 产生的 message、tool、permission 和 Agent lifecycle 事件优先使用 payload workspace，缺失时由 agent/session 解析；无法验证 scope 的事件会被丢弃。可运行 `npm run check:automation-runtime-event-scope` 验证双 workspace 隔离和未知 scope 阻断。

```text
ngf-agent-bridge chat list
ngf-agent-bridge chat create --name "Release coordination"
ngf-agent-bridge chat create --plan-id <id> --confirm
ngf-agent-bridge chat get --room-id <room-id>
ngf-agent-bridge chat message post --room-id <room-id> --body "Please review" --client-message-id <stable-id>
ngf-agent-bridge chat ack --room-id <room-id> --last-seq <seq>
```

HarmonyOS App 在 Workspace 设置的“自动化与协作”区消费 `schedules`、`loops`、`chatRooms` 三个独立 feature flag；旧 Bridge 缺字段时默认隐藏增强入口，不影响既有 workspace、Provider 和会话功能。

## Voice

Bridge Voice 使用短生命周期内存会话，不把原始音频写入普通 profile、日志或诊断报告。公开 RPC 为：

- `voice.status`
- `voice.session.start/chunk/finish/cancel`
- `voice.tts.speak/stop`

STT/TTS Provider 通过 HTTPS 配置启用；环境变量和进程内配置都必须使用 HTTPS，凭证只从指定环境变量读取。Bridge 默认不提供本机麦克风或扬声器，`voice.status.capabilities.audioCapture/audioPlayback` 默认为 false；这两个字段只有显式平台适配器传入 true 时才会发布。

```text
AGENT_BRIDGE_VOICE_STT_URL=https://speech.example/stt
AGENT_BRIDGE_VOICE_STT_TOKEN_ENV=PRIVATE_STT_TOKEN
AGENT_BRIDGE_VOICE_TTS_URL=https://speech.example/tts
AGENT_BRIDGE_VOICE_TTS_TOKEN_ENV=PRIVATE_TTS_TOKEN
```

未配置端点时，Bridge 保持协议可用并返回 `capability_unavailable`，不会伪造 transcript、TTS 或 VAD。Chunk 必须携带严格递增 sequence，且受单块大小、会话总量、速率、TTL、超时和响应大小限制；完成、取消、过期、连接断开及 daemon shutdown 都会清零内存音频 Buffer。

录音 MIME 必须来自 Bridge 公布的 audio allowlist（包括 `audio/pcm`、`audio/raw`、WAV、MPEG、OGG/Opus、WebM、AAC 和 FLAC）；采样率必须是 8000–192000 Hz 的整数，声道为 1 或 2，采样深度为 8/16/24/32。语言、voiceId、TTS 文本和 Provider transcript 会清除控制字符并受长度限制，非法值返回结构化 `failureCategory`，不会静默夹断。

TTS 请求和 Provider 返回使用同一格式校验，支持 `mp3`/`wav`/`ogg` 等短格式别名；未知 MIME 或无效 sample profile 返回 `voice_tts_format_unsupported` 或 `voice_tts_audio_profile_invalid`，不会回退到默认格式。Provider 错误只返回稳定类别和脱敏文案，缺失的 confidence/durationMs 保持缺失。

远程 TTS 请求可选携带 `clientRequestId`。Bridge 会在 `tts.started`、`tts.ready`、`tts.failed`、`tts.cancelled` 及 RPC 结果中回显该值；`voice.tts.stop` 携带 client id 时优先按当前连接 owner 查找，旧客户端仍可只使用内部 `requestId`。HarmonyOS App 为每次播放生成新的 client id，并用它与 speak RPC/internal id 共同丢弃取消后的迟到结果。

为保持旧客户端兼容，成功的远程 TTS 音频会同时出现在 `voice.tts.updated` 事件与 `voice.tts.speak` RPC response。HarmonyOS App 使用 `clientRequestId`、内部 TTS request id 和 envelope request id 构造单次 delivery identity，并在媒体播放前按 generation、host 和 connection epoch 去重；这两条协议路径不是两次独立播放请求。

HarmonyOS App 播放压缩音频时按 SDK 23 状态机启动 AVPlayer：idle 注册 `stateChange`/`error` listener → 设置 `dataSrc` → 等待 `initialized` → `prepare()` → `play()`，每个异步阶段用播放 generation、player 身份和 request id 复核；release 对称注销 listener 并唤醒初始化等待者，旧播放器的迟到回调、Promise 或 DataSource 回调不会污染新一轮播放，正常完成与 PCM/raw 播放完成都会清理平台 TTS 请求身份。

Voice lifecycle 事件按连接 owner 精确单播。`VoiceManager` 只把内部 owner metadata 交给 Bridge 路由层，`voice-event-router.js` 仅投递给匹配 `connectionId` 的 WebSocket，server 发送前会移除 owner 字段；缺少 owner 的事件不会广播到其他连接，因此 transcript、VAD、TTS 状态和音频结果不会跨连接泄露。`node scripts/check-voice-event-scope-smoke.js` 覆盖双连接隔离和空 owner 阻断，并已纳入 `npm run check`。

如果端点不是 HTTPS、包含凭证或 fragment，Bridge 会拒绝该端点并在 `voice.status.warnings` 返回稳定的 `stt_endpoint_requires_https` 或 `tts_endpoint_requires_https` code；状态不会回显 URL 或 token。

远程 Voice 的数据保留状态通过 `voice.status.privacy` 公开，而不是通过日志、profile 或 UI 配置泄露端点信息。部署方可使用进程配置 `sttRetentionPolicy` / `ttsRetentionPolicy`，或仅在启动时读取 `AGENT_BRIDGE_VOICE_STT_RETENTION` / `AGENT_BRIDGE_VOICE_TTS_RETENTION`；允许的策略仅为 `not_retained`、`ephemeral`、`retained`。显式对象配置可另外声明受限来源 `provider_declared` 或 `operator_declared` 及非负的 `durationSeconds`。未知、缺失或非法声明一律归一化为 `unknown`，并在有对应远程端点时返回 `stt_retention_policy_unknown` 或 `tts_retention_policy_unknown`，使 App 显示风险提示而不是默认假定不保留。

```text
AGENT_BRIDGE_VOICE_STT_RETENTION=ephemeral
AGENT_BRIDGE_VOICE_TTS_RETENTION=not_retained
```

公开 privacy DTO 只含每条 STT/TTS 链路的 `dataForwarded`、受限策略/来源/可选时长、整体状态和 `userNoticeRequired`；它绝不返回 endpoint、token、原始环境变量、音频或 transcript。该 DTO 由可选 `serverInfo.features.voicePrivacyStatus` 发布，旧 Bridge 缺失时 App 保持既有 Voice capability 行为。

```text
ngf-agent-bridge voice status
ngf-agent-bridge voice session start --session-id <agent-session-id> --language zh-CN
ngf-agent-bridge voice session chunk --session-id <voice-id> --sequence 0 --audio-base64 <pcm-base64>
ngf-agent-bridge voice session finish --session-id <voice-id>
ngf-agent-bridge voice session cancel --session-id <voice-id>
ngf-agent-bridge voice tts speak --session-id <agent-session-id> --text "Hello"
ngf-agent-bridge voice tts stop --request-id <tts-request-id>
```

HarmonyOS App 优先使用 SDK 23 AudioKit/CoreSpeechKit，并分别检查 `voiceAudioCapture`、`voiceAudioPlayback`、`voiceSpeechToText`、`voiceTextToSpeech`、`voiceRemoteSpeechToText` 和 `voiceRemoteTextToSpeech` capability；旧 `features.voice` 仅作为兼容汇总值。录音入口和播放入口使用独立 capability gate，仅远程 TTS 可用时不显示为可录音能力。设备本地 STT 可用时不创建 Bridge Voice session，本地不可用且远程 capability 可用时才上传音频；即使能力探测阶段初始化了 CoreSpeechKit，`remote_stt` 模式也不会向本地识别引擎写入 chunk 或调用 finish/cancel，释放时仍清理已初始化引擎。每次 AudioCapturer 的 `readData` callback 绑定 generation 和 capturer identity，迟到回调会在分帧前丢弃，释放时使用相同 callback 注销；AudioSession deactivation listener 在 facade release 时注销。本地与远程 TTS 每次只选择一路，远程 `audioBase64` 由 NGF media 播放层消费。VAD 只接受设备识别引擎或 Provider 明确发布的 speech/silence 状态，不从 PCM 振幅推测。平台能力、权限与降级边界见 `docs/agent-bridge-voice.md`。

## Docker

Docker 构建上下文固定为本目录，基础镜像同时提供 Bridge daemon 和 CLI：

```text
docker build --target bridge -t ngf-agent-bridge:0.1.4 -f docker/Dockerfile .
```

镜像默认使用 uid/gid 10001、`AGENT_BRIDGE_HOME=/data`、端口 8787 和前台 supervisor。必须通过 `AGENT_BRIDGE_TOKEN` 或 `AGENT_BRIDGE_TOKEN_FILE` 注入凭证；镜像不会预置 token、Provider CLI 或用户凭证。

推荐挂载：

- `/data`：完整 Bridge Home，包含配置、日志、identity、Provider、checkpoint、terminal capture、queue、usage 和 security state。
- `/workspace`：用户授权的工作区，可按任务挂载为读写或只读。
- `/opt/ngf/providers:ro`：可选的外部 Provider binary。

容器模式禁止 daemon 原地 update/rollback。升级使用固定镜像 tag 和同一 `/data` 卷；回滚时按 schema 需要恢复对应的整卷快照。Compose、安全参数、备份恢复和多架构命令见 `docs/agent-bridge-docker.md`。

```text
node scripts/check-docker-contract-smoke.js
AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1 npm run check:docker-runtime
```

完整 Bridge 回归使用 `npm run check:r75`（已由 `npm run check` 的 `postcheck` 自动调用），会验证远程配置 contract 和 Docker 静态 contract。容器 runtime smoke 默认受控跳过；需要实际构建/启动/重启容器时显式设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 后执行 `npm run check:docker-runtime`。Docker daemon 不可用时会明确 skip。镜像已包含同源 Web UI；它通过一次性 WebSocket ticket、CSP、Host/Origin 校验和现有 Bridge capability gate 复用 daemon 协议，不创建平行后端。

 Web UI 的终端区域在 `terminalBinaryFrames` 可用时使用 V2 binary stream：`terminal.subscribe` 返回连接期 slot，Bridge 通过 `RESTORE`/`SNAPSHOT`/`OUTPUT` 帧恢复和推送输出，页面通过 `INPUT`/`RESIZE` 帧写入并在 WebSocket `bufferedAmount` 超限时提示背压；旧 Bridge 自动降级到 bounded `terminal.capture`。Workspace registry 区域使用 `workspace.registry.list/create/import/open/archive`：Import、Open、Archive 均按 preview -> confirm 执行，Archive 只标记 registry、不删除本地目录；旧 Bridge 缺少 import RPC 时 Import 回退到现有 create 流程，请求期间会禁用重复操作并在当前 workspace 被归档后重新选择 active 条目。`workspaceFiles` capability 开启时，页面使用 `workspace.files.list` 浏览当前 workspace、用 `workspace.file.get` 做受限预览，并通过 `workspace.file.download` 获取一次性同源下载 URL。Git 页面已接入 stage/unstage/commit/pull/push/branch/stash/merge/discard；discard/pull、branch delete、stash pop/drop 和 merge 的确认必须携带同一 Bridge 返回的短期 `planId`，并提供 summary/files/unified 视图和当前文件分页缓存。Settings/doctor 区域读取 `daemon.status`、`daemon.health`、`workspace.registry.doctor` 和 `diagnostics.export`，展示八组诊断状态、兼容结果、脱敏 remediation/actionId，并提供 JSON/text 导出；缺少新 RPC/字段时使用安全 fallback。GitHub 区域已消费 OAuth Device Flow、账号/仓库 binding、PR/checks/watch 和附件 preview/upload，写操作继续使用 Bridge plan gate；多标签之间只通过不携带凭证的 `BroadcastChannel` 同步 workspace/session 变更、刷新和注销。R65 进一步在广播中携带 endpoint/hostProfileId 与 payload scope，拒绝跨 Bridge/host 的 refresh、workspace、scope、session 事件，并把 workspace.changed 限定为 registry + 受影响 session 的局部刷新。连接生命周期使用 `connectionGeneration` 丢弃旧 socket/旧刷新结果，`refreshInFlight` 合并重复全量刷新；pagehide、显式 logout 和跨标签 logout 统一清理重连/刷新 timer、GitHub watch、terminal subscription、pending RPC 和 BroadcastChannel，重新提交登录可恢复 transport。真实多标签现场、旧 Bridge、长流和浏览器现场仍属于 23B 后续验收门。

M5 Session Experience 区域由 `messageQueue`、`usageEvents`、`usageBudgets` 和 `metadataGeneration` capability 独立控制。开启后，Web UI 在当前 host/workspace/agent/session/provider scope 下展示持久消息队列（取消、失败重试和 attempt 状态）、Usage actual/estimated token 分类、按 currency 分组的费用、Provider quota、compaction/usage event 明细和非阻断 budget warning，并提供 budget 设置/清除。Metadata 支持 `sessionTitle`、`branchName`、`commitMessage`、`pullRequest` 四类 preview；建议可编辑、复制、重新生成或取消，取消真实调用 `metadata.generate.cancel`，只有 session title 通过既有 `agent.update` 应用。所有体验刷新在写入状态前校验连接代际与完整 scope，旧 Bridge 缺 capability/字段时隐藏整个增强区，不影响既有聊天、workspace、Git 和终端。可重复验证：

```text
node scripts/check-web-session-experience-smoke.js
node scripts/check-web-session-experience-live-smoke.js
```

两条 smoke 与 `npm run check:r88` 已接入全量 `postcheck`；它们证明源码和本地 Bridge 契约，不替代真实 Provider 长会话、真实旧 Bridge、双标签、长流和 HarmonyOS App 现场验收。

旧 Bridge 兼容由 `src/web/compatibility.js` 统一处理：缺少 `health.features`/`serverInfo.features` 时不猜测增强能力，只保留 Agent/chat/workspace 核心路径；`session.messages` 缺失时使用 attach 返回的 `messages`/`timeline`，workspace registry 不可用时从 Agent scope 构造只读列表，Import 在旧 Bridge 上回退 `workspace.registry.create`。未知事件和带冲突 host/workspace/agent/session scope 的迟到事件直接丢弃，缺 scope 的旧事件保持兼容。可重复验证：`node scripts/check-web-compatibility-smoke.js`、`node scripts/check-web-ui-contract-smoke.js`、`node scripts/check-web-ui-live-smoke.js`。

### Web GitHub 工作台

Web UI 复用 Bridge 的 GitHub RPC，不保存或展示 OAuth token。开启 `githubIntegration` 与 `githubPrWorkflow` 后，页面提供 Device Flow 登录（仅展示用户码和 HTTPS 验证地址）、账号选择、`hostProfileId + workspaceId` 到 owner/repository 的显式绑定、PR 分页/状态/检查、reviewer/label 更新、ready/merge 和 watch 生命周期。所有 PR 写操作使用 Bridge 返回的短期 `planId` 执行 preview -> confirm；页面离开当前 PR 或连接关闭时释放 watch。开启 `githubAssetUpload` 后，附件必须先以 workspace 相对路径执行 `github.attachment.preview`，确认后才上传并创建 comment；未配置 HTTPS 上传器时按钮隐藏并保留 capability 提示。旧 Bridge 缺少这些 feature 时只保留原有聊天、Git、终端和诊断功能。

本轮可重复验证：

```text
node scripts/check-web-github-smoke.js
node scripts/check-github-host-scope-live-smoke.js
```

前一条 smoke 使用本地 mock GitHub API 验证 auth/binding/PR/checks/watch/attachment 能力；后一条启动真实 Bridge WebSocket 连接验证 host binding、OAuth session、PR plan 和 watch owner 隔离。两者都不代表真实账号、组织权限、限流或线上资产服务现场验收。

## Workspace Service Proxy

Workspace 服务由 Bridge 以受管子进程运行，服务 cwd 必须位于已注册 workspace，命令不会经过 shell，代理上游固定为 `127.0.0.1`。注册、启动、停止和删除均先 preview 再 confirm：

```text
ngf-agent-bridge service list --workspace-id <workspace-id>
ngf-agent-bridge service start --service-id <service-id>
ngf-agent-bridge service stop --service-id <service-id>
ngf-agent-bridge service logs --service-id <service-id>
```

Bridge 重启时会依据 `desiredState` reconcile 仍声明运行的服务；归档 Agent 或 workspace 会清理其 owner 服务。代理只转发受限请求头，不转发 Bridge bearer、Cookie 或代理控制头。`service open` 先 preview/confirm，再签发绑定 service、owner、Host、PID 与 TTL 的单次 URL；首次访问换取 service-scoped `HttpOnly; SameSite=Strict` 短会话并 303 移除票据。HTTP、WebSocket、可选精确域名、App/Web Open 和生命周期操作均受 `serverInfo.features.serviceProxy` 控制。
Bridge 重启时会依据 `desiredState` reconcile 仍声明运行的服务；归档 Agent 或 workspace 会清理其 owner 服务。代理只转发受限请求头，不转发 Bridge bearer、Cookie 或代理控制头。`service open` 先 preview/confirm，再签发绑定 service、owner、Host、PID 与 TTL 的单次 URL；首次访问换取 service-scoped `HttpOnly; SameSite=Strict` 短会话并 303 移除票据。HTTP、WebSocket、可选精确域名、App/Web Open 和生命周期操作均受 `serverInfo.features.serviceProxy` 控制。

`workspace.service.updated` lifecycle 事件按发起 WebSocket 的 owner connectionId 精确单播，不再全局广播。owner 只保存在 Bridge 运行期的 service map，发送给客户端前会删除；连接关闭或 service remove 会清理 map。HTTP CLI/Web RPC 没有 WebSocket owner 时仍返回操作结果，但不会把其他连接的 workspace、cwd、端口或运行状态推送出去。可运行 `npm run check:service-event-scope` 验证该边界。

```text
ngf-agent-bridge service open --service-id <service-id>
npm run check:service-access
npm run check:service-routing
npm run check:service-live
```

## Browser Automation

Browser Automation 使用 capability-based host broker。Bridge 不根据 Electron、Web 或 HarmonyOS 平台名称推测能力；每个 host 必须通过 `browser.host.register` 显式声明 workspace 范围与真实支持的命令，新 host 还应通过可选 `supportedActions` 声明 click、fill、type、keypress、hover、select、drag、upload、scroll、download、evaluate 的真实支持范围，并可声明 `hostKind`、`runtime`、`capabilitySource`、`readiness`、`supportedPlatforms` 和 `capabilityWarnings`。只声明旧 `supportedCommands` 的 host 保留兼容路由，但 action 不可用时新 host 会返回稳定的 `browser_action_unavailable`；`degraded`/`unavailable` host 只用于诊断，不参与 dispatch，并返回 `browser_host_not_ready`。显式 HarmonyOS host 必须声明 `capabilitySource=platform`，Bridge 当前将 `browserPlatformHost` 发布为 false，不把普通 CDP host 冒充为平台适配器；没有兼容 host 时仍返回 `browser_no_host`，App/Web 不显示伪造页面状态。

所有 `browser.page.action` payload 先经过 Bridge 统一边界校验：元素 ref/sourceRef/targetRef 最多 256 UTF-8 bytes，keypress key 最多 128 bytes，文本/值和 evaluate 脚本最多 128 KiB；控制字符、空 ref、空脚本、同时提供不同脚本字段、超出范围的 drag 坐标和 scroll delta 会返回结构化失败，不创建 plan 或触达 host。旧 `toX`/`toY` drag 字段仍映射为 `targetX`/`targetY`；upload 保留旧 optional-ref 行为以兼容既有 host。可运行 `npm run check:r119` 验证输入边界；该检查不替代真实平台 host、恶意页面、登录态、上传/下载或 HarmonyOS App 现场验收。

R120 进一步将 action payload 投影为按 action kind 声明的最小字段集合。workspace/agent/host/instance/page 标识、ref/key、输入值、drag/scroll/evaluate 参数逐项归一化；`url`、`cwd`、`headers`、环境、非 evaluate 脚本、confirm/planId 和未知字段不会传给 host。内部 download directory 与校验后的 upload filePaths 由 Bridge 自己注入。drag `steps` 限制为 2–20 整数。可运行 `npm run check:r120` 验证 validator 和真实 outbound envelope；该检查不替代真实平台 host、恶意页面、登录态、上传/下载或 HarmonyOS App 现场验收。

仓库提供零新增依赖的 Chromium CDP host。默认只允许 loopback 调试端口：

```text
# 先由用户显式启动带远程调试端口的 Chromium
$env:AGENT_BRIDGE_TOKEN='<bridge-token>'
node src/browser-cdp-host.js --bridge-url http://127.0.0.1:8787 --cdp-url http://127.0.0.1:9222 --workspace-ids <workspace-id>
```

远程 CDP 默认拒绝；只有显式 `--allow-remote-cdp` 且 endpoint 使用 HTTPS 时才接受。`/json/list` 返回的 `webSocketDebuggerUrl` 会在建连前再次校验：只允许 ws/wss，拒绝 embedded credential、fragment、HTTPS → WS 降级、host/port 改写和 loopback/远程网络范围跳转。Bridge 侧域名 allowlist 必须先 preview/confirm。点击、输入、上传、下载与 evaluate 使用 action plan；上传文件必须通过 workspace realpath 校验，preview/confirm 还绑定文件大小、mtime 和 SHA-256，默认单文件上限 64 MiB、总计 128 MiB；下载目录固定为 workspace 下的 `.agent-bridge-downloads`。Bridge 接收 host result 后会重新组装响应信封，禁止 host 覆盖 `ok`、command/host identity、时间、失败字段或 `__proto__` 等原型键；permission、download action 和 `download.list` 的公开结果只返回相对目录标识/文件元数据，移除绝对 `downloadDirectory`、`downloadPath`、`filePath`、`path` 和 `filePaths`，并只保留无凭证的 HTTP(S) 下载 URL（嵌入式用户名/密码、控制字符、非 HTTP(S) 或超长 URL 会被移除）。内部 command payload 仍使用受管绝对目录。审计只记录 workspace/Agent/host/page id 和结果类别，不记录输入文本、脚本、文件内容或截图正文。

CDP host 支持 page/instance lifecycle、HTTP(S) navigation、accessibility snapshot 与 stale ref、PNG screenshot、console/network logs、wait、click/fill/type/key/hover/select/drag/upload/scroll/evaluate/download、dialog 处理和 download progress。drag 支持 source/target ref 或有界坐标，执行前检查元素 visible/enabled/stable，按下鼠标后分段移动并在异常时释放。Web UI 的 Browser Automation 区域已提供 host 选择、instance list/create/close、page create/list/close、navigate/back/forward/reload、snapshot、screenshot、logs、wait、download list、permission 和全部 action；host 未声明命令或 action 时不显示对应按钮，上传路径只接受 workspace-relative 值。App/CLI/MCP 继续复用 Bridge RPC，不创建平行后端。

Web screenshot 预览只消费 Bridge 返回的 PNG/JPEG/WebP DTO；Bridge 和 `src/web/compatibility.js` 会重新校验 MIME、Base64、PNG/JPEG/WebP 文件签名、8 MiB 编码上限和 6 MiB 解码上限，并以受控 `data:` URL 交给 `<img>`，不使用 host 原始 bytes 或 `innerHTML`。host/page 切换、断线、logout、Browser capability 关闭和页面生命周期会清理预览。可运行 `npm run check:r117` 验证格式签名、parser、manager DTO 和伪图片拒绝，`npm run check:r116` 验证完整 Web contract；真实平台 host、恶意页面和登录态仍需现场验收。

HarmonyOS App Browser 基础入口通过响应 envelope `id` 或 payload `requestId` 关联每个 RPC。页面允许多个 Browser 请求同时在途并按 request ID 处理乱序响应；只有单请求旧 Bridge 响应缺少 ID 时才采用兼容关联，多请求缺 ID 会安全丢弃。host 切换、断开和页面销毁会清理 pending 状态。App 截图预览只接受 PNG/JPEG/WebP，Base64 载荷限制为 8 MiB；不支持 MIME、空数据或超限响应不会进入 Image 组件，也不写入日志或持久化。缺少 `browserAutomation` capability 或新字段时，旧 Bridge 继续使用既有 App 能力并隐藏增强状态。

Browser host 注册/注销以及 workspace domain permission 更新事件按连接 owner 精确单播，不再全局广播。Bridge 内部短暂使用 `ownerId` 选择匹配的 WebSocket `connectionId`，发送给 App/Web 前会移除该字段；空 owner 或不匹配连接不会收到 `browser.updated`。HTTP CLI/Web RPC 没有 WebSocket owner 时仍返回操作结果，但不会把其他连接的 host 或权限元数据推送出去。可运行 `npm run check:browser` 验证该边界。

```text
npm run check:browser
node scripts/check-web-ui-contract-smoke.js
node scripts/check-web-ui-live-smoke.js
ngf-agent-bridge browser host list --workspace-id <workspace-id>
ngf-agent-bridge browser permission set --workspace-id <workspace-id> --domain example.com
ngf-agent-bridge browser page create --workspace-id <workspace-id> --url https://example.com
```

### App 预算币种缺省语义（R80）

Agent Home 的用量预算编辑器把缺失币种保持为 unavailable（空值），不会把 Provider 或 Bridge 未提供的值显示为 `USD`。切换 session/day/month、清除预算和重置当前用量 scope 会清理旧币种；成本预算必须由用户显式填写币种，纯 token 预算不要求币种。该约束由 `check:r80` 的 App 静态 smoke 和 ArkTS parser 断言覆盖，不代表真实 Provider 账单币种或真机 Usage 现场已通过。

### Metadata turn usage accounting（R81）

Provider metadata turn 可以在返回 suggestion 时附带可选 `usage`。Bridge 会把真实 token/cost 规范化为 `kind=metadata`，绑定当前 host/session/agent 后写入 UsageManager，并通过同 host 的 `usage.updated` 事件让 App 的 actual Usage 明细即时更新。无有效数值、非法负值或缺失数据时不会补零；没有 Provider usage 的旧实现仍只返回 suggestion。metadata RPC 结果额外返回可选 `usageEventsRecorded`，用于显示是否产生了新的计费事件。

重复 metadata 请求如果复用同一 Provider `eventId`，由 UsageManager 幂等去重，不会重复计费或再次触发预算告警。可重复验证：

```text
npm run check:r81
node scripts/check-metadata-usage-accounting-smoke.js
```

该 smoke 使用显式 `AGENT_BRIDGE_MOCK_METADATA_USAGE=1` fixture，不代表真实 Provider 账单权限、长会话 compaction 或真机 Usage/Diagnostics 现场已经验收。

### Usage aggregate integrity（R82）

Usage summary 按 `providerId + quotaSource + window` 保留 Provider 的每个 quota window；hour/day/month 或 Provider 自定义窗口不会互相覆盖。token 聚合只在累加结果仍为非负安全整数时保留，cost 聚合遇到浮点溢出时保留 unavailable，不返回 `Infinity`。`usage.budget.set` 的 token 上限同样要求非负安全整数，小数和超范围输入返回 `invalid_budget_limit`。定向验证可运行：

```text
node scripts/check-usage-aggregate-integrity-smoke.js
npm run check:r82
```

同一 quota window 的多个 snapshot 按规范化 `occurredAt` 选择最新值；迟到旧响应不会回退 Usage summary，事件历史仍保持追加写入。可运行 `node scripts/check-usage-quota-order-smoke.js` 或 `npm run check:r83` 验证。

### App quota window compatibility（R84）

Provider quota snapshot 的 window 与预算窗口是两种不同语义。App 继续把 usage summary、budget 和查询窗口限制为 session、day、month，但会保留 Bridge 返回的安全 Provider 自定义 quota 窗口，例如 hour 或 rolling-7d。窗口名会去除首尾空白，并拒绝空值、控制字符、Unicode 行分隔符、路径分隔符、点路径段和超过 64 个字符的值；被拒绝的窗口保持 unavailable，不会被伪造为 session。R84 的 App parser 测试覆盖自定义窗口与这些安全边界。

### Usage event quota window compatibility（R85）

Usage event 明细沿用同一安全边界，但先区分事件语义：`kind=quota`，或带有 `quotaRemaining`、`quotaLimit`、`quotaResetAt`、`quotaSource` 任一字段的旧 quota event，会保留安全的 Provider 自定义 `window`；普通 turn、metadata、compaction 事件仍只接受 `session`、`day`、`month`。因此 `hour`、`rolling-7d` 等 Provider 窗口可以在 quota 明细中展示，但不会扩大旧 usage/budget 查询契约。可运行以下回归：

```text
npm run check:r82
npm run check:r83
npm run check:r79
npm run check:r30
```

App parser 同时拒绝路径穿越、控制字符、Unicode 行分隔符、点路径段和超长窗口。缺字段的旧 Bridge 保持安全默认值，恶意或非法窗口显示 unavailable。

### Provider recorded session replay（R87）

Codex App Server usage/compaction 事件优先采用响应中的 `occurredAt`、`completedAtMs` 或 `timestamp`；缺少权威时间时才回退到 Bridge 当前时间。`thread/compacted` 与 `item/completed(contextCompaction)` 按 thread/turn 配对，无论先后到达都只计入一次，并优先保留 item 的原因和前后 token。

`scripts/provider-recorded-session-fixture.json` 是脱敏的协议形状 fixture，`check-provider-recorded-session-smoke.js` 使用真实 Codex/OpenCode/Gateway normalizer 回放多轮 usage、双 compaction 顺序、quota reset、四类 metadata 和 UsageManager 重建恢复。它只证明源码回归，不代表真实 Provider 账号、账单、网络断线或设备现场。可运行：

```text
npm run check:r87
```

### HarmonyOS App Browser screenshot surface（R151）

Agent Home 的 Browser 页面提供整页截图开关；选中后 `browser.page.screenshot` 才携带 `fullPage=true`，未选择时保持旧协议的 `false` 默认值。页面同时保留 click、fill、type、keypress、hover、select、drag、upload、scroll、download、evaluate 全部 action，并继续按 host capability 和 Preview/Confirm 风险门执行。上传只接受当前 workspace 文件选择，Bridge 负责最终 realpath、摘要和权限校验。

可运行 `npm run check:r151` 验证 App source action surface；`npm run check:browser` 验证 Bridge manager、event scope、CDP、live 和 protocol alignment。该源码证据不替代真实 platform Browser host、恶意页面/登录态、上传下载和真机现场验收。

### Web Browser full-page screenshot（R152）

Web Browser 工作台的 `Full-page screenshot` checkbox 默认关闭。选中后，截图请求向既有 `browser.page.screenshot` RPC 发送 `fullPage=true`；未选择或旧 Bridge 缺字段时保持 `false`。截图仍受 host/page scope、connection generation、PNG/JPEG/WebP 签名和大小限制约束，不会因打开整页模式绕过 host capability 或 permission gate。

可运行 `npm run check:r152` 验证控件、payload、兼容 parser 和禁止硬编码 `fullPage=false`；`npm run check:browser` 验证 Browser manager、event scope、CDP、live 与协议对齐。真实 platform Browser host、恶意页面/登录态、上传下载、多标签和长流仍需现场验收。

### Web Browser permission 状态展示（R159）

Web Browser 工作台现在消费 `browser.permission.get` 并在 `browser-permission-status` 区展示当前 workspace 的 allowlist 域、受管下载目录状态与更新时间（与 HarmonyOS App 的 R69 展示对齐）。`refreshBrowserPermission()` 绑定 `refreshBrowser` 的 refreshIsCurrent（refreshToken、connection generation、socket 生命周期、pageClosing 与 workspace）丢弃迟到结果；旧 Bridge 缺 RPC 或请求失败时静默降级为空状态，不阻断 hosts/instances/pages 主流程。可运行 `npm run check:r13`、`npm run check:r88`、`npm run check:r116` 与 Bridge 全量 `npm run check` 验证。
