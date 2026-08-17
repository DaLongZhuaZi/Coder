# R151 Browser App Action Surface

日期：2026-08-10  
状态：已完成（HarmonyOS App Browser action surface 源码子阶段；第 16、23D 仍为部分实现）

## 目标

核查 HarmonyOS Agent Home 的 Browser 控制面是否真正暴露已存在的 Bridge 能力，并补齐整页截图这一条此前只存在于协议/client/parser、但没有 App 可见入口的能力。保持 capability gate、请求 scope、Preview/Confirm 和旧 Bridge 兼容行为。

## 已实现

- Browser 页面已有 host、instance、page 生命周期，以及 navigate、back、forward、reload、snapshot、screenshot、logs、wait、download 和 action 控件。
- action surface 保留 click、fill、type、keypress、hover、select、drag、upload、scroll、download、evaluate 全部 11 类 action；敏感 action 继续经 Preview -> Confirm。
- 新增 `browserScreenshotFullPage` 状态和本地化 Switch；截图请求将该值传给 `requestBrowserScreenshot()`，不再固定发送 `false`。
- Browser screenshot parser 测试覆盖 `fullPage=true`；模型/client 已保留 optional `fullPage`，旧 Bridge 缺字段时继续使用 `false` 安全默认值。
- 上传入口继续使用当前 workspace 文件选择与 realpath policy；App 不接受自由绝对路径，不把凭证或内部路径传给 Browser host。

## 自动化与构建证据

本轮实际通过：

```text
npm run check:r151
npm run check:browser
node -e "JSON.parse(...)"   # resources/package JSON parse
git diff --check
$env:DEVECO_SDK_HOME='F:\\DevEco Studio\\sdk'; & 'F:\\DevEco Studio\\tools\\hvigor\\bin\\hvigorw.bat' assembleHap --no-daemon --stacktrace
```

`check:r151` 输出 `browser app action surface smoke ok`；`check:browser` 的 manager、event scope、CDP、live 和 protocol alignment smoke 均通过。SDK 23 `CompileArkTS`、`PackageHap`、`SignHap` 和 `assembleHap` 通过，只有既有 syscap、弃用 API 和异常处理警告。产物 `entry/build/default/outputs/default/entry-default-signed.hap` 大小为 `14,523,736` bytes，SHA-256 为 `71D6A09B39D3D5A0006810AA7EBE245A31EF2487DBE713F1FC2E77F26EBCAAB6`。

## 安全与兼容边界

- `browserAutomation=false` 或旧 Bridge 缺少新字段时，App 隐藏增强状态，保留旧 Browser/聊天能力。
- 截图只接受 Bridge 已校验的 PNG/JPEG/WebP DTO；App 不渲染 host 原始 bytes，不记录截图正文。
- host、workspace、instance、page 切换和页面销毁继续清理 pending request、日志、下载和截图状态；响应按 request id 关联。
- full-page 是用户显式选择，不改变 Bridge 默认行为，也不绕过 host 的真实 capability 声明。

## 未关闭的现场门

- 真实受支持的 HarmonyOS/platform Browser host 与平台能力注册。
- 真实 CDP/Chromium 页面上的整页截图、上传、下载、弹窗、跨域、恶意页面和登录态隔离。
- 真机 Browser action、弱网/长流、权限和 host 清理。若需要安装 HAP，只允许安装到 `5KLBB25A10203862`，不得启动、测试、读取日志或操作其他设备。

上述现场门未完成前，不把第 16、23D 对齐项标记为“已实现”。
