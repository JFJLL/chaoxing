# 阻塞项

## R4 全新 AI 生成与双教师浏览器链未现场完成（2026-07-29）

- 证据：本地 `.env.local` 只有 Zovii 演示账号配置，没有 AI provider/model key；实际浏览器使用真实 Next.js、SQLite 和既有持久化教案/AI课件/PPT 验证页面、权限边界与保存读取，未伪造前端数据。
- 影响：真实数据库批次 A-D、来源快照、确认链和 PPT 持久化均有自动化证据，但“本轮新上传两份资料后现场调用外部模型生成教案/课件”未完成；也未用两个独立浏览器登录身份完整操作一次协作码链。
- 处理：不得声称这两条现场链已完整验证；需要具备 AI 模型配置和可切换的同机构教师账号后人工/浏览器补验。

## R4 遗留文案位于允许修改范围外（2026-07-29）

- 证据：`src/app/space/courses/[courseId]/structure/page.tsx:29` 仍显示“AI 文档建课”。
- 冲突：R4 要求清除该旧文案，但允许修改目录不包含 `structure/**`；直接修改会违反“只允许改”的硬规则。
- 处理：白名单内入口统一为“导入课程文档”；该单点不越界修改，最终报告明确列出。

## R4 课程外围页面仍有 owner-only 判定（2026-07-29）

- 证据：全课程权限扫描在 `src/app/space/courses/[courseId]/{page.tsx,html-courseware/**,structure/**,resources/**}` 仍发现 `course.ownerId === user.id`。
- 冲突：上述页面不在允许修改范围；直接扩大改动会违反白名单硬规则。
- 处理：任务指定的课堂、签到、作业、考试、通知、题库、学情和课后页面/API 已按课程管理者权限处理；外围页面不越界修改，也不声称完整覆盖。

## R4 协作教师课程云盘页面/API 位于允许修改范围外（2026-07-29）

- 证据：`src/app/space/courses/[courseId]/drive/page.tsx` 仍调用 `requireCourseOwner`；`src/app/api/drive/route.ts` 仍按个人 ownerId/文件所有者读写。
- 冲突：两者均不在本轮“只允许改”的目录中；直接修改会越过硬白名单。
- 影响：协作教师可通过允许范围内的课程文档导入接口上传/选入资料，但通用课程云盘旧页面仍不能完整管理课程根目录。
- 处理：不越界修改，最终明确标记“协作教师完整课程云盘管理未完成”。

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
