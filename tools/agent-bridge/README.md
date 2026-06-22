# Agent Bridge Desktop

Agent Bridge Desktop 运行在电脑侧，负责把 HarmonyOS App 的统一会话协议转换成本机 Agent 的实际接口。它默认使用跨平台 Node 启动器，支持 Windows、macOS 和 Linux。

## 安装与启动

Agent Bridge Desktop 已发布到 npm。它是需要在电脑侧长时间存在的工具服务，推荐先全局安装一次：

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

- 扫描本机可用 Provider：OpenCode、DevEco Code、MiMo Code、Codex CLI、Claude Code、Antigravity CLI、Mock Provider。
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

## 可用参数

```bash
ngf-agent-bridge --connect-host 192.168.1.23
ngf-agent-bridge --bind-host 0.0.0.0
ngf-agent-bridge --port 8787
ngf-agent-bridge --token dev-token
ngf-agent-bridge --lang zh
ngf-agent-bridge --start opencode,deveco,mimo
ngf-agent-bridge --no-start-providers
```

参数含义：

- `--connect-host`：写入二维码和 App 的连接地址，真机通常填电脑局域网 IP。
- `--bind-host`：Bridge 实际监听地址，真机调试通常为 `0.0.0.0`。
- `--port`：Bridge 端口。
- `--token`：Bridge Token。
- `--lang` / `--language`：TUI 显示语言，支持 `zh` 和 `en`。
- `--start`：强制启动指定 OpenCode-compatible server，支持 `opencode`、`deveco`、`mimo`。
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

## Provider 支持

- `mock`：内置测试 Provider，不依赖外部 Agent。
- `opencode`：连接本机 `opencode serve`。
- `deveco`：连接本机 `deveco serve`。
- `mimo`：连接 MiMo/OpenCode-compatible server。
- `codex`：调用 `codex exec --json`。
- `claude`：调用 `claude -p --verbose --output-format stream-json --include-partial-messages`。
- `antigravity`：保留显式 CLI 配置入口。

OpenCode、DevEco Code、MiMo Code 这类 server 型 Provider 可以由启动器自动拉起；Codex、Claude、Antigravity 这类 CLI 型 Provider 会在收到消息时由 Bridge 调用。

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
