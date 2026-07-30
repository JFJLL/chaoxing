# PROGRESS — codex/prep-production-chain-r6-ux-flow-fix

## 1. 起点

- 起始 SHA: `8f792c7d7e5d0e9cffaf76ffcfc2f14ea12ebac3`
- 分支: `codex/prep-production-chain-r6-ux-flow-fix`（从 `codex/prep-production-chain-r5-root-binding-fix` 起点新建）
- 不修改 / 推送 / 合并 `main`。

## 2. 四个目标问题

1. 课程云盘文件选择默认折叠且延迟加载。
2. 最近导入按“一次导入批次”展示，而不是按单文档任务展示，并支持批次删除。
3. 课程目录能够安全保存（保留同名 ID、创建新项、安全删除无引用旧项、引用保护），且维护页可被找到。
4. AI 教案、AI 课件来源默认折叠，且保存按钮移动到右上角。

## 3. 实施顺序

1. 任务1 云盘选择默认折叠 + 延迟加载（`CourseDocumentImportSources.tsx`）。
2. 任务3 目录安全保存：新增 `mapImportedOutlineToCourse.ts`，改造 `applyOutline.ts` 与保存确认（`OutlineReviewEditor.tsx`）。
3. 任务2 最近导入按批次聚合（`RecentImports.tsx` + `ImportBatchTimeline.tsx` + `getImportBatchProgress()`）+ 批次删除 API。
4. 任务4 目录维护页入口与编辑态按钮（content 页、`ChapterTree.tsx`、错误提示入口）。
5. 任务5/6 AI 教案资料、AI 课件来源折叠（`AiAppGenerator.tsx` + `CollapsibleSourcePanel.tsx`）。
6. 任务7 保存按钮移到右上角（`AiAppGenerator.tsx` + `AiArtifactEditor.tsx`）。
7. 测试补齐、全量回归、验收。

## 4. 最大风险

- `applyOutline.ts` 是保存目录的核心事务，改动同步/删除策略若不当会造成数据错绑或误删被引用课时；必须靠真实数据库测试守住 ID 保留、引用保护、乐观锁。
- 批次删除需保证队列 Worker 识别 `deletedAt`，避免处理中任务把状态改回可见。

## 5. 测试基线（起点实测）

- 单元 `vitest list`：597 行（含 `it.each` 模板计数方式）。
- 集成 `vitest.integration.config.ts`：18。
- 约束：测试数不得低于 599；`.skip/.todo` 为 0；不得删除或弱化测试。

## 进度

- [x] 分支与基线记录
- [ ] 任务1 云盘折叠
- [ ] 任务2 最近导入批次
- [ ] 任务3 目录安全保存
- [ ] 任务4 维护页入口
- [ ] 任务5/6 AI 来源折叠
- [ ] 任务7 顶部保存
- [ ] 测试与验收
