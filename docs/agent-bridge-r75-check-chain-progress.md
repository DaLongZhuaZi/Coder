# R75 Bridge 验证链收口进度

更新时间：2026-08-09

## 目标

把 Docker contract/runtime 与远程配置 contract 纳入 `tools/agent-bridge` 的正式 `npm run check` 生命周期，避免只在手工 `preprecheck` 中执行而被全量回归遗漏。该阶段只证明源码/契约验证，不把 Docker daemon、跨平台安装或设备现场验收记为通过。

## 任务状态

- [x] 新增 `check:r75`，组合远程配置 `check:r32`、Docker contract smoke 与 Docker runtime smoke。
- [x] 将 `check:r75` 接入 `postcheck`，因此 `npm run check` 会执行该阶段。
- [x] 执行定向 `check:r75`；远程配置和 Docker contract 通过，Docker runtime 默认按 opt-in 规则跳过并退出 0。
- [x] 执行 Bridge 全量 `npm run check`；主链及全部 postcheck 退出码 0，R75 在 postcheck 中实际执行。
- [x] 执行 `git diff --check`，并更新 README、架构文档、持续进度和对齐清单证据。

## 验证边界

- Docker contract smoke 是静态安全契约检查。
- Docker runtime smoke 默认只做受控跳过并退出 0，避免每次 Bridge 回归隐式构建镜像；显式设置 `AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 后，才在 Docker Linux daemon 可用时构建、运行、重启容器。
- 远程配置契约由既有 R32 smoke 覆盖签名、HTTPS、scope、plan 失效、回滚和状态持久化。
- Windows/Linux/macOS 全局安装、自启升级、真实签名 endpoint、双 Bridge rolling 仍属于第 14 项现场验收。
- 任何 HAP 设备操作仅允许目标 `5KLBB25A10203862`，只安装，不启动、不测试；本阶段没有设备操作计划。

## 实际验证

```text
node --check scripts/check-docker-runtime-smoke.js
npm run check:r75
AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty npm run check
git diff --check
```

结果：以上 Node/Bridge 检查和静态复核均通过；`AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1` 的完整镜像构建/容器重启验证未作为本轮通过证据记录。
