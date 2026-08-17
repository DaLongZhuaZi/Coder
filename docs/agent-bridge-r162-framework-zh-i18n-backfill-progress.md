# R162 ngf_framework zh_CN i18n 资源补齐

日期：2026-08-15
状态：已完成（框架模块三份语言资源键对齐维护；不改变任何条目状态）

## 目标

R161 补齐 entry 的 zh_CN 后，继续检查 `ngf_framework` 模块资源，发现其 `zh_CN/element/string.json` 缺失 31 个 base 键（`ngf_about_*` 前缀的 About 文案，base 值以中文为主，运行时会回退 base）；`en_US` 与 base 对齐。

## 已实现

- 以 base 中文值 + en_US 值构造 31 个缺失键。
- `python scripts/i18n_updater.py --file <temp> --module ngf_framework` 补齐（base/en_US 零改动，zh_CN 新增 31 键）。
- 验证：entry 与 ngf_framework 两模块的 base/zh_CN/en_US 三份资源全部双向无缺失。

## 自动化证据

- 资源对齐脚本：entry base 1406 / zh_CN 1406 / en_US 1406；ngf_framework base 1301 / zh_CN 1301 / en_US 1301；两模块 `zh_missing=0`、`en_missing=0`。
- SDK 23 `assembleHap --no-daemon --stacktrace`：退出码 0，`BUILD SUCCESSFUL`；`entry/build/default/outputs/default/entry-default-signed.hap` 于 2026-08-15 13:17:49 生成，大小 `14,551,995` bytes，SHA-256 `9BC7CDF76C5A9CAC2F2AC350C1367915F549AB87BFEEDF37FB37F2AC234F6114`。仅保留既有 syscap、弃用 API 和异常处理警告。
- `git diff --check`：退出码 0。

## 未关闭的门

- 本轮仅维护资源文件，未修改逻辑；App 各条目状态不变。
- 本轮未安装、启动或测试设备。
