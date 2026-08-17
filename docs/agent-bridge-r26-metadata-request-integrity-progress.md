# R26 Metadata request integrity

更新时间：2026-08-08

## 目标

继续收口清单第 22、34 项的 metadata 请求生命周期。该阶段只证明 Bridge/App/MCP/CLI 的超时、取消、断开和 scope 完整性，不把真实 Provider 长会话或真机展示写成已完成。

## 已完成

- [x] Bridge 在 Provider turn 开始前建立 request state，并用受控 `Promise.race` 处理 timeout；超时返回稳定 `metadata_timeout`，不会等待迟到 Provider 结果。
- [x] Bridge 连接关闭路径会标记 request 为 detached、清理 pending map 并拒绝未完成 Promise；迟到 Provider 结果不能发送响应、事件或写回当前状态。
- [x] `metadata.generate.cancel` 只处理同一连接内的 request，并校验 `hostProfileId`、`sessionId` 和 `agentId`；控制请求的响应不会错误发送到原 metadata 连接。
- [x] 同一 requestId 的重复 cancel/generate 不会重复消费或覆盖既有结果；取消结果包含 `cancelled`、`requestId`、`failureCategory` 和受控 remediation。
- [x] App parser 暴露 `requestId`、`timeoutMs`、`cancelled`，页面在 host/connection 生命周期中清理 metadata pending 状态；MCP 增加 `metadata_generate_cancel`，CLI 支持四类 metadata、timeout 和 cancel。
- [x] Mock Provider 支持可控 metadata delay；R26 行为 smoke 覆盖正常返回、timeout、cancel、duplicate request 和 scope mismatch。

## 本轮实际验证

```text
npm --prefix tools/agent-bridge run check
$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

Bridge 全量 `check` 退出码 0，包含 `check:r26` metadata request smoke、R12/R13 和 Voice platform postcheck。SDK 23 HAP 构建在修正 App parser 字段归属后退出码 0，`BUILD SUCCESSFUL in 38 s 248 ms`。

产物：`entry/build/default/outputs/default/entry-default-signed.hap`，大小 14,204,392 bytes，SHA-256 `4D0C10F68CC4C2C164AD532B902B21EE7F6DE55CAA34E6C954A4B78D3CF2D753`。

构建初次尝试暴露 `AgentBridgeModels.ets` parser 将 metadata 字段误写入 workspace registry 类型；已修正并重新构建通过。最终只保留既有 syscap、deprecated API 和异常处理警告。

## 设备边界

本轮 HDC `list targets -v` 显示 `5KLBB25A10203862` 为 `Offline`；另有其他设备在线。按设备限制未执行 HAP 安装，没有启动或测试应用，也没有向其他设备安装。

## 尚未关闭的现场门

- [ ] 真实 Provider 的四类 metadata、长会话 timeout/cancel、凭证撤销和网络异常。
- [ ] 真机 Usage/Diagnostics/metadata UI、host 切换和跨窗口生命周期。

因此第 22、34 项继续保持“部分实现”；R26 只关闭 metadata request integrity 源码子阶段。

R26 的断开清理由 Bridge 代码路径实现，但原有行为 smoke 未建立真实 WebSocket 连接；该证据缺口由 R27 `metadata request disconnect smoke` 单独补齐。
