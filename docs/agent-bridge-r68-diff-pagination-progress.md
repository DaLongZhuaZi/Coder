# R68 App Git/Diff 分页闭环进度

更新时间：2026-08-09

## 目标

沿用 Bridge 已有的 `workspace.diff.get` 分页协议，补齐 HarmonyOS App 的文件级、行级和字节级请求参数、响应解析、继续加载状态和持久化。旧 Bridge 缺少新增字段时只展示已返回的首段，不改变现有 Git/Diff 功能。

## 任务状态

- [x] 核对 Bridge `workspace.diff.get` 的 `fileCursor`、`fileLimit`、`lineOffset`、`lineLimit`、`maxBytes` 和下一页字段。
- [x] 增加 App 强类型 Diff result/parser 和可选请求参数；旧响应缺字段时使用首段安全默认值。
- [x] 增加 App Diff 状态的文件/行游标、截断原因和继续加载交互；重复页不会再次拼接。
- [x] 增加持久化幂等迁移，保留 Diff 分页状态的安全默认值；工作区重绑定会保留全部分页字段。
- [x] 补充 parser/client/page 定向测试并接入现有测试清单；Bridge Git smoke 覆盖文件/行/字节分页。
- [x] 执行 Bridge 定向 smoke、`git diff --check`；SDK 23 HAP 构建通过。
- [x] 检查唯一指定设备；目标 `5KLBB25A10203862` 为 `Offline`，未执行安装；未启动、不测试任何设备。

## 验证边界

- 自动化只证明协议和源码闭环，不替代真实 Git 仓库、超大 Diff 和真机现场验收。
- 不向其他设备安装；设备安装失败或离线时保留事实，不改变源码状态。

## 证据

## 本轮验证记录（2026-08-09）

- `node --check tools/agent-bridge/scripts/check-workspace-git-smoke.js`：退出码 0。
- `node tools/agent-bridge/scripts/check-workspace-git-smoke.js`：退出码 0，输出 `workspace git plan smoke ok`、`workspace git smoke ok`。
- `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check`：退出码 0。
- `git diff --check`：退出码 0，无空白错误；既有 CRLF 警告不构成失败。
- `$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL in 32 s 326 ms`。
- HAP：`entry/build/default/outputs/default/entry-default-signed.hap`，14,370,753 bytes，SHA-256 `706F131009D41F5E0D0182B2339C86B897DA3C9899FD2F49EE9223E27437EADE`。
- `hdc list targets -v`：目标 `5KLBB25A10203862` 为 `Offline`；未执行 `install -r`，在线的其他 target 未使用。

## 现场边界

- 自动化覆盖协议分页、续页和安全上限，不替代真实大型仓库、二进制 Diff、弱网和真机渲染现场。
- 任何安装仅允许目标设备 `5KLBB25A10203862`，且只执行安装，不启动、不读取日志、不进行设备测试。
