# R80 App usage budget currency integrity

更新时间：2026-08-09

## 目标

修正 App 用量预算编辑器在 Bridge 未提供真实币种时的显示和状态语义，避免把缺失值伪造成 `USD`。真实币种仍按 Bridge 返回值展示；成本预算继续要求用户显式填写币种。

## 已完成

- [x] `NGFAgentHomePage` 的预算币种 draft 初始值改为空字符串。
- [x] 收到 `usage.budget.get/set` 响应时直接使用解析后的币种，不再用 `USD` 回填缺失字段。
- [x] 切换预算窗口、清除预算和重置当前用量 scope 时清理币种 draft，避免把其他 scope 的币种带入当前编辑器。
- [x] 既有 `AgentBridgeUsageBudgetRecord` 空字符串默认值和成本预算显式币种校验保持不变。
- [x] `AgentBridgeM5Parser.test.ets` 增加缺失币种解析断言。
- [x] 新增 `check-app-usage-budget-currency-smoke.js`，并以 `check:r80` 接入 Bridge `postcheck`。

## 实际验证

```text
node --check scripts/check-app-usage-budget-currency-smoke.js
node scripts/check-app-usage-budget-currency-smoke.js
npm run check:r80
git diff --check
```

以上命令本轮均退出码 0。R80 修改了 ArkTS 页面，但本轮未执行 SDK 23 HAP 构建，也未进行设备安装；本次只是预算缺省值语义修正，不属于需要推送安装包的重大功能更新。

## 边界

真实 Provider 币种、套餐 quota、长会话 compaction、metadata 生产链和真机 Usage/Diagnostics 展示仍属于第 22、34 项 FIELD 验收门；R80 不改变总项“部分实现”状态。

设备边界保持：若后续重大功能更新需要安装，只允许向 `5KLBB25A10203862` 安装，且只安装、不启动、不测试。
