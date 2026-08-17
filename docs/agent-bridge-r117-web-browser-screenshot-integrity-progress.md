# R117 Web Browser screenshot content integrity

更新时间：2026-08-10

## 范围

R116 已完成截图 MIME、Base64 和大小边界，但任意满足这些条件的文本仍可能被当作图片交给 Web `Image`。本阶段补齐 Bridge 与 Web parser 的真实格式签名校验，避免外部 Browser host 伪造截图载荷或让 UI 预览不受支持的内容。

## 实现

- PNG 必须以 `89 50 4e 47 0d 0a 1a 0a` 开头。
- JPEG 必须以 `ff d8 ff` 开头。
- WebP 必须同时包含 `RIFF` 文件头和偏移 8 处的 `WEBP` 标识。
- Bridge 只解码 Base64 的前 12 字节用于签名判断，不信任 host 上报的 `bytes`；Web compatibility 使用同等的无依赖前缀解码逻辑。
- MIME、Base64、8 MiB 编码上限、6 MiB 解码上限或签名任一失败均返回 `browser_screenshot_invalid`，原始数据不会进入公开 DTO 或页面。
- smoke 使用最小真实格式签名，并覆盖伪 PNG、MIME/签名错配以及有效 JPEG/WebP。

## 本次验证

| 验证 | 结果 |
|---|---|
| `npm run check:r117` | 通过 |
| `npm run check:r116` | 通过 |
| `npm run check:browser` | 通过 |
| Node `--check`（Bridge、Web parser 与 smoke） | 通过 |
| `git diff --check` | 通过；仅有既有换行格式提示 |

本阶段只修改 Node Bridge、Web compatibility、smoke、package script 和文档，没有 ArkTS/HAP 改动；没有安装、启动、读取日志或测试设备。指定设备 `5KLBB25A10203862` 未被操作。

## 边界

真实 Browser platform host、HarmonyOS Browser host、恶意页面、登录态隔离、真实上传/下载和 App 全量动作仍属于第 16、23D 的现场验收门；本阶段不改变这些条目的“部分实现”状态。
