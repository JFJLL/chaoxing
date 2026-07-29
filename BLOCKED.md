# 阻塞项

## 第 3 轮最终项目回执失败（达到轮次上限，停止修复与重跑）

- 命令：`pwsh -NoProfile -File scripts/verify-change.ps1`
- 结果：退出码 1；回执 `.verification/receipt.json` 状态为 `fail`，开始于 17:23:13，结束于 17:25:08。
- 单元测试 lane：`tests/unit/importPipeline.test.ts` 的初始化 hook 超过 10 秒，文件内 3 项未执行；本次汇总为 78 个文件通过、1 个文件失败，551 项通过、3 项被动 skipped。没有在源码中添加 `.skip/.todo`。
- 对照证据：同一轮开始前独立 `npm run verify` 退出码 0，79 个文件、554 项全部通过，skip/todo 0；因此当前证据指向串行 R3 脚本运行时的超时/资源竞争，但未在轮次上限后继续猜测或重跑。
- 其他 lane：static、typecheck、build、smoke、integration、data、Kimi browser、AI eval 均通过；`agent-review` 因缺少该证据 lane 而失败。
- 剩余工作：后续会话需要定位 R3 串行环境下 `importPipeline` hook 超时，并补齐 `agent-review` 证据后重新生成新鲜回执。按“最多 3 轮，满 3 轮立即停止”硬规则，本会话不再开启第 4 轮。

## 任务 1 backfill 执行证据与真实缺文件阻塞

- 命令：`npx vite-node scripts/backfill-import-drive-files.ts`
- 结果：退出码 1；`vite-node` 未加载项目 `@/` 路径别名，报 `Failed to load url @/lib/db` / `@/lib/permissions`。
- 处理：未使用 `|| true`，也未改验收脚本；入口已改为显式 `async main()`，运行器问题已修复。
- 第二次尝试：`npx --no-install tsx scripts/backfill-import-drive-files.ts` 退出码 1；别名已正常解析，但 CJS 输出不支持 top-level await。
- 第三次 dry-run：退出码 0；扫描 1 条，linked/reused/created 均为 0。记录 `cmroabmsl002zepoe5xge3l9j` 的 `filePath` 为 null，按硬规则仅报告“缺少 filePath”，不删除记录。
- 正式执行第 1、2 次：均退出码 0；同一缺文件记录被报告，第二次 created 为 0，未重复创建。缺少原始文件无法在不造假、不丢数据的前提下回填，因此保留为真实数据阻塞。

## 白名单与“协作教师可上课”的冲突

- 证据：签到、学情、作业、考试等教师页面在 `src/app/space/courses/[courseId]/{attendance,analytics,activities,assignments,exams}/**` 内直接用 `course.ownerId === user.id` 判定管理权限。
- 冲突：任务要求协作教师可上课，但这些页面不在允许修改白名单内；擅自修改会违反“只允许改”的硬规则。
- 处理：继续完成白名单内的协作数据模型、课程访问、相关 API、备课与课程云盘权限；不修改上述页面。最终不能声称协作教师“完整上课 UI”已验证，除非后续白名单被扩展。

## 协作课程列表页面不在白名单

- 证据：`src/app/space/courses/page.tsx` 直接以 `where: { ownerId: user.id }` 查询“我教的课”，但该文件不在允许修改范围；白名单内的 `/api/courses?tab=taught` 已能返回所有者与协作课程。
- 影响：协作教师通过深链可进入并管理白名单内备课/云盘功能，但现有服务端课程列表页不会展示协作课程。
- 处理：不越界修改页面；保留 API 与权限测试证据，并在最终报告中明确该 UI 缺口。
