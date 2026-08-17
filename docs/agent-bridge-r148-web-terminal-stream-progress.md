# R148 Web Terminal V2 sequence integrity

更新时间：2026-08-10

## 目标

Web Terminal 已支持 V2 binary subscribe/restore/output，但页面原先只读取 NGF2 正文和截断标志，没有消费 `restoreSeq` 与 `snapshotSeq`。断线、重订阅或重复帧可能让旧恢复快照覆盖当前输出，也可能在恢复完成前追加迟到 delta。

## 已完成

- 新增 `src/web/terminal-stream-state.js`，提供可测试的订阅 epoch、期望恢复序列、snapshot/restore 序列和 delta gate。
- NGF2 snapshot header 现在解析 `restoreSeq`、`snapshotSeq`、persisted/truncated 标志；legacy 文本帧继续按 V1 读取。
- Web V2 subscribe 先等待权威 restore；恢复前的 output delta 被丢弃，避免旧流污染新缓存。
- 重复或更旧的 restore/snapshot frame 不再替换当前输出；更高序列仍可正常更新。
- unsubscribe、socket close、显式 shutdown 和手动 snapshot 请求均建立/结束明确的 stream epoch。
- `index.html` 以独立同源脚本加载流状态模块，`app.js` 只消费其公开 API。

## 验证

本轮实际执行并通过：

- `npm run check:r148`
- `npm run check:r147`
- `npm run check:r65`
- `npm run check:r88`
- `npm run check:r13`
- `git diff --check`

R148 smoke 覆盖 NGF2 编解码、expected restore、重复/旧序列拒绝、更新序列、legacy V1 兼容、restore 前 delta gate 和 reset。未修改 ArkTS/HAP，未执行 SDK 构建、设备安装、启动或测试。

## 仍待现场

- 真实长 terminal stream、真机 renderer、超长中文/宽字符输出和多次断线重连。
- 真实多标签、旧 Bridge V1 和 HarmonyOS App Terminal UI。
- 第 23B 及第 4 项整体状态继续保持“部分实现/现场待验”。
