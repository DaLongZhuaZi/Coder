# R54 GitHub Credential Store 安全收口进度

更新时间：2026-08-09

## 目标

补齐第 9 项维护清单中的 credential store 回归：命令执行必须有界并检查退出状态，OAuth token 只能通过标准输入进入 DPAPI/Keychain/Secret Service，Windows 文件写入原子化且账号标识不能逃逸目录。

## 已完成

- `github-credential-store.js` 从无界 `execFile` 改为带超时、输出上限和显式退出状态的 `spawnSync` 执行器；命令失败不再因为空 stdout 被误判为成功。
- Windows DPAPI protect/unprotect 脚本继续只从 stdin 读取 token；token 不进入命令参数、日志或普通 JSON。凭证文件使用临时文件写入后原子 rename，账号 key 限制为安全字符和 128 字节以内。
- macOS Keychain、Linux Secret Service 的 write/read/remove 均检查命令结果；旧 `read()` 字符串接口保持兼容，缺失或失败仍返回空字符串。
- 新增 `check-github-credential-store-smoke.js`：用受控 child-process stub 验证超时/执行模式、stdin 传 secret、命令参数无 secret、账号路径穿越阻断和清理；Windows 分支额外验证 DPAPI 文件不含明文并可删除。
- `check:github-credential-store` 已加入 Bridge `postcheck`，因此全量 `npm run check` 每轮执行 credential store 语法和安全 smoke。

## 本轮实际验证

- `node --check tools/agent-bridge/src/github-credential-store.js`
- `node --check tools/agent-bridge/scripts/check-github-credential-store-smoke.js`
- `node tools/agent-bridge/scripts/check-github-credential-store-smoke.js`
- `node --check tools/agent-bridge/src/github-client.js`
- `git diff --check`

上述定向命令以及 `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm --prefix tools/agent-bridge run check` 均退出码 0；全量 check 的 `postcheck` 已实际执行 `check:github-credential-store`。没有 ArkTS/HAP 变更，不执行设备安装。

## 现场门

- macOS Keychain、Linux Secret Service 的真实可用性和权限弹窗仍需对应平台现场验收。
- Windows DPAPI 用户切换、Bridge Home ACL 和真实 OAuth Device Flow token 撤销仍需现场验证。
- 现场产生重大 HAP 时仅允许安装到 `5KLBB25A10203862`，只安装，不启动或测试。
