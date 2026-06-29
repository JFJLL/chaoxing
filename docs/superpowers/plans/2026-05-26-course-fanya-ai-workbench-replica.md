# Course Fanya AI Workbench Replica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When any course card is opened, show a course-specific Fanya-style workspace matching the second screenshot, including the full course left sidebar and an AI Workbench where the AI 应用 tab includes AI 出题, AI 教案, AI 课件, and AI 组卷.

**Architecture:** Keep the existing global personal-space shell and course list, but replace `/space/courses/[courseId]` with a nested course workspace shell. The course workspace owns its own left navigation, top Fanya header, AI workbench tabs, module pages, and minimal working data flows, while reusing existing course, chapter, resource, announcement, AI import, and permission helpers.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, SQLite, React Server Components, client components for tab interactions, Tailwind CSS, lucide-react, existing auth/permission system, Playwright.

---

## Source Screenshots To Match

### Entry Behavior

From the first screenshot:

- User is on the personal-space course list.
- Clicking a course card such as `功能体验课` opens the course-specific page in the second screenshot.
- In the replica, **all courses** must open the Fanya-style course workspace and **all courses** must include `AI工作台`.

### Course Workspace Shell

From the second screenshot:

- Top header:
  - Left logo text: `泛雅`
  - Right user avatar/name: `李素艳`
- Course-specific left sidebar:
  - Course cover card with course title.
  - `课程门户 >`
  - `链接`
  - Sidebar tabs:
    - `AI工作台`
    - `班级活动`
    - `课件`
    - `教案`
    - `课程结构`
    - `资料`
    - `通知`
    - `讨论`
    - `作业`
    - `考试`
    - `题库`
- Active tab styling:
  - `AI工作台` selected, pale blue row background.
  - Small colorful AI icon next to text.
- Main background:
  - light blue/white gradient.
  - large white rounded content card.
- AI Workbench top tabs:
  - `AI助教`
  - `AI应用` active
  - `AI实践`
  - `AI学情分析`
- Search:
  - `AI智能检索资源`
  - round star/magic button.
- AI 应用 inner category tabs:
  - `全部应用` active
  - `备课中心`
  - `教学神器`
  - `学习助手`
  - `资料科研`
- AI 应用 toolbar:
  - `创建AI应用`
  - `全部应用`
  - `批量管理`
  - search input `搜索`
  - banner button `AI应用开放平台 >`
- AI application cards visible in the screenshot:
  - `资料助手`
  - `AI科研助手`
  - `AI出题`
  - `AI陪练`
  - `AI组卷`
  - `AI教案`
  - `程序题自测`
  - `AI写作批阅`
  - `AI课件`
  - lower row partially visible: `公式识别`, `智能编号`, `作业查重`

For this goal, implement working detail flows for only:

- `AI出题`
- `AI教案`
- `AI课件`
- `AI组卷`

Other AI app cards may be visible but disabled or read-only.

## Current Project Context

Relevant existing files:

- `src/app/space/courses/page.tsx` renders course cards.
- `src/components/courses/CourseCard.tsx` links course cards to `/space/courses/[courseId]`.
- `src/app/space/courses/[courseId]/page.tsx` currently renders a generic course overview.
- `src/app/space/courses/[courseId]/builder/page.tsx` already handles course directory building.
- `src/app/space/courses/[courseId]/ai-import/page.tsx` already handles AI document course generation.
- `src/lib/permissions.ts` already gates course access.
- `prisma/schema.prisma` already has course, chapter, lesson, resource, announcement, note, and job models.

This plan must preserve existing course builder and AI import URLs. It should make the default course page feel like the Fanya workspace instead of the current generic card overview.

## Scope

### In Scope

- Replace default course page with Fanya-style course workspace.
- Add reusable course workspace shell components.
- Add full visible course left sidebar tabs from the screenshot.
- Ensure every course has `AI工作台` regardless of owner or course title.
- Implement AI Workbench with top tab navigation and AI 应用 active by default.
- Render the AI application card grid shown in the screenshot.
- Implement clickable app pages/workflows for `AI出题`, `AI教案`, `AI课件`, and `AI组卷`.
- Add backend persistence for generated AI app outputs.
- Add page/module stubs with meaningful local data for all course sidebar tabs.
- Add UI-level Playwright coverage for entering a course and using the four requested AI apps.

### Out Of Scope

- Pixel-perfect visual match.
- Real Fanya/Chaoxing private APIs.
- Real PPT generation beyond structured local content for `AI课件`.
- Full question-bank algorithms beyond locally persisted generated questions and papers.
- Full live classroom/attendance features beyond sidebar tab shell and local course-module content.

## Data Model

Add these Prisma models:

```prisma
model CourseAiArtifact {
  id        String   @id @default(cuid())
  courseId  String
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  appType   String
  title     String
  prompt    String?
  payload   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`appType` values:

- `question_generation`
- `lesson_plan`
- `courseware`
- `paper_assembly`

Payload examples:

```ts
type AiQuestionPayload = {
  questions: Array<{
    type: "single_choice" | "multiple_choice" | "short_answer";
    stem: string;
    options?: string[];
    answer: string;
    explanation: string;
  }>;
};

type AiLessonPlanPayload = {
  objectives: string[];
  keyPoints: string[];
  teachingProcess: Array<{ phase: string; minutes: number; activity: string }>;
  assessment: string[];
};

type AiCoursewarePayload = {
  slides: Array<{ title: string; bullets: string[]; speakerNotes: string }>;
};

type AiPaperPayload = {
  title: string;
  sections: Array<{ name: string; score: number; questionIds: string[] }>;
};
```

## File Structure

- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/types/courseWorkspace.ts`
- Create: `src/lib/courseWorkspace/nav.ts`
- Create: `src/lib/courseWorkspace/aiApps.ts`
- Create: `src/lib/courseWorkspace/generateAiArtifact.ts`
- Create: `src/app/api/courses/[courseId]/ai-apps/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-apps/[artifactId]/route.ts`
- Modify: `src/app/space/courses/[courseId]/page.tsx`
- Create: `src/app/space/courses/[courseId]/layout.tsx`
- Create: `src/app/space/courses/[courseId]/ai-workbench/page.tsx`
- Create: `src/app/space/courses/[courseId]/ai-workbench/apps/[appType]/page.tsx`
- Create: `src/app/space/courses/[courseId]/activities/page.tsx`
- Create: `src/app/space/courses/[courseId]/courseware/page.tsx`
- Create: `src/app/space/courses/[courseId]/lesson-plans/page.tsx`
- Create: `src/app/space/courses/[courseId]/structure/page.tsx`
- Create: `src/app/space/courses/[courseId]/resources/page.tsx`
- Create: `src/app/space/courses/[courseId]/notices/page.tsx`
- Create: `src/app/space/courses/[courseId]/discussions/page.tsx`
- Create: `src/app/space/courses/[courseId]/assignments/page.tsx`
- Create: `src/app/space/courses/[courseId]/exams/page.tsx`
- Create: `src/app/space/courses/[courseId]/question-bank/page.tsx`
- Create: `src/components/course-workspace/FanyaCourseShell.tsx`
- Create: `src/components/course-workspace/CourseWorkspaceSidebar.tsx`
- Create: `src/components/course-workspace/CourseWorkspaceHeader.tsx`
- Create: `src/components/course-workspace/AiWorkbench.tsx`
- Create: `src/components/course-workspace/AiAppGrid.tsx`
- Create: `src/components/course-workspace/AiAppCard.tsx`
- Create: `src/components/course-workspace/AiAppGenerator.tsx`
- Create: `src/components/course-workspace/CourseModulePanel.tsx`
- Create: `tests/e2e/course-workspace.spec.ts`
- Create: `tests/unit/courseAiApps.test.ts`

## Task 1: Add Course AI Artifact Data Model

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/types/courseWorkspace.ts`
- Create: `tests/unit/courseAiApps.test.ts`

- [ ] **Step 1: Add Prisma model**

Add `CourseAiArtifact` to `prisma/schema.prisma` and relations:

```prisma
model Course {
  // existing fields
  aiArtifacts CourseAiArtifact[]
}

model User {
  // existing fields
  courseAiArtifacts CourseAiArtifact[]
}

model CourseAiArtifact {
  id        String   @id @default(cuid())
  courseId  String
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  appType   String
  title     String
  prompt    String?
  payload   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Create migration**

Run:

```bash
npm run db:migrate -- --name course_ai_artifacts
npm run db:generate
```

Expected: migration succeeds and Prisma client includes `courseAiArtifact`.

- [ ] **Step 3: Add shared types**

Create `src/types/courseWorkspace.ts`:

```ts
export type CourseAiAppType = "question_generation" | "lesson_plan" | "courseware" | "paper_assembly";

export type CourseWorkspaceTab =
  | "ai-workbench"
  | "activities"
  | "courseware"
  | "lesson-plans"
  | "structure"
  | "resources"
  | "notices"
  | "discussions"
  | "assignments"
  | "exams"
  | "question-bank";

export type AiQuestionPayload = {
  questions: Array<{
    type: "single_choice" | "multiple_choice" | "short_answer";
    stem: string;
    options?: string[];
    answer: string;
    explanation: string;
  }>;
};

export type AiLessonPlanPayload = {
  objectives: string[];
  keyPoints: string[];
  teachingProcess: Array<{ phase: string; minutes: number; activity: string }>;
  assessment: string[];
};

export type AiCoursewarePayload = {
  slides: Array<{ title: string; bullets: string[]; speakerNotes: string }>;
};

export type AiPaperPayload = {
  title: string;
  sections: Array<{ name: string; score: number; questionIds: string[] }>;
};
```

- [ ] **Step 4: Seed one artifact per requested AI app**

In `prisma/seed.ts`, after courses and users are created, seed for `功能体验课`:

- `AI出题` artifact with 3 questions.
- `AI教案` artifact with a simple teaching process.
- `AI课件` artifact with 3 slides.
- `AI组卷` artifact referencing seeded/generated questions.

Keep seed data generic enough for all courses; the UI should work even if a course has no artifacts.

- [ ] **Step 5: Add unit tests**

Create `tests/unit/courseAiApps.test.ts`:

- Asserts each `CourseAiAppType` maps to one app definition.
- Asserts generator returns valid payload for all four requested app types.
- Asserts unsupported app type throws a readable error.

- [ ] **Step 6: Verify**

Run:

```bash
npm run db:migrate -- --name course_ai_artifacts
npm run db:seed
npm run test -- tests/unit/courseAiApps.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add prisma src/types/courseWorkspace.ts tests/unit/courseAiApps.test.ts
git commit -m "feat: add course AI app artifacts"
```

## Task 2: Build Fanya Course Workspace Shell

**Files:**
- Create: `src/lib/courseWorkspace/nav.ts`
- Create: `src/components/course-workspace/FanyaCourseShell.tsx`
- Create: `src/components/course-workspace/CourseWorkspaceHeader.tsx`
- Create: `src/components/course-workspace/CourseWorkspaceSidebar.tsx`
- Create: `src/app/space/courses/[courseId]/layout.tsx`
- Modify: `src/app/space/courses/[courseId]/page.tsx`
- Modify: `src/components/courses/CourseCard.tsx`

- [ ] **Step 1: Define sidebar nav**

Create `src/lib/courseWorkspace/nav.ts`:

```ts
import {
  Bot,
  CalendarDays,
  ClipboardList,
  File,
  FileText,
  Folder,
  LayoutList,
  MessageCircle,
  NotebookText,
  PenLine,
  ScrollText,
  Volume2
} from "lucide-react";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";

export const courseWorkspaceNav: Array<{
  id: CourseWorkspaceTab;
  label: string;
  hrefSegment: string;
  icon: typeof Bot;
}> = [
  { id: "ai-workbench", label: "AI工作台", hrefSegment: "ai-workbench", icon: Bot },
  { id: "activities", label: "班级活动", hrefSegment: "activities", icon: CalendarDays },
  { id: "courseware", label: "课件", hrefSegment: "courseware", icon: File },
  { id: "lesson-plans", label: "教案", hrefSegment: "lesson-plans", icon: NotebookText },
  { id: "structure", label: "课程结构", hrefSegment: "structure", icon: LayoutList },
  { id: "resources", label: "资料", hrefSegment: "resources", icon: Folder },
  { id: "notices", label: "通知", hrefSegment: "notices", icon: Volume2 },
  { id: "discussions", label: "讨论", hrefSegment: "discussions", icon: MessageCircle },
  { id: "assignments", label: "作业", hrefSegment: "assignments", icon: PenLine },
  { id: "exams", label: "考试", hrefSegment: "exams", icon: ClipboardList },
  { id: "question-bank", label: "题库", hrefSegment: "question-bank", icon: ScrollText }
];
```

- [ ] **Step 2: Create course workspace header**

Create `CourseWorkspaceHeader.tsx` that renders:

- Left logo block: red rounded square icon and text `泛雅`.
- Right user avatar/name with small chevron.
- Fixed height close to `72px`.
- White background with subtle shadow.

- [ ] **Step 3: Create course sidebar**

Create `CourseWorkspaceSidebar.tsx` props:

```ts
type Props = {
  course: { id: string; title: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
};
```

It must render:

- Course cover card.
- `课程门户 >` and `链接` row over cover.
- Course title.
- All sidebar tabs from `courseWorkspaceNav`.
- Active pale-blue row for `AI工作台`.

- [ ] **Step 4: Create shell wrapper**

Create `FanyaCourseShell.tsx`:

```tsx
export function FanyaCourseShell({
  user,
  course,
  activeTab,
  children
}: {
  user: SessionUser;
  course: { id: string; title: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef7ff] via-[#f7fbff] to-[#eef3ff]">
      <CourseWorkspaceHeader user={user} />
      <div className="flex pt-[72px]">
        <CourseWorkspaceSidebar course={course} activeTab={activeTab} />
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
```

Implement the actual import paths and responsive behavior during coding.

- [ ] **Step 5: Add nested course layout**

Create `src/app/space/courses/[courseId]/layout.tsx`:

- Load `requireUser()`.
- Load course by `courseId`.
- Call `requireCourseAccess(user, courseId)`.
- Determine active tab from pathname in a client wrapper or by passing active tab from each page.

If Next layout cannot read pathname server-side cleanly, use each page to render `FanyaCourseShell` directly through a small helper. Do not break existing nested routes.

- [ ] **Step 6: Make default course page redirect**

Modify `src/app/space/courses/[courseId]/page.tsx`:

```ts
import { redirect } from "next/navigation";

export default async function CourseDefaultPage({ params }: PageProps) {
  const { courseId } = await params;
  redirect(`/space/courses/${courseId}/ai-workbench`);
}
```

This makes clicking course cards open the second-screenshot-style AI workbench by default.

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
```

Manual check:

- Open `/space/courses`.
- Click any course card.
- It should land on `/space/courses/[courseId]/ai-workbench`.
- The page should show the Fanya header and course left sidebar.

- [ ] **Step 8: Commit**

```bash
git add src/lib/courseWorkspace src/components/course-workspace src/app/space/courses/[courseId] src/components/courses/CourseCard.tsx
git commit -m "feat: add Fanya course workspace shell"
```

## Task 3: Implement AI Workbench AI 应用 Page

**Files:**
- Create: `src/lib/courseWorkspace/aiApps.ts`
- Create: `src/components/course-workspace/AiWorkbench.tsx`
- Create: `src/components/course-workspace/AiAppGrid.tsx`
- Create: `src/components/course-workspace/AiAppCard.tsx`
- Create: `src/app/space/courses/[courseId]/ai-workbench/page.tsx`

- [ ] **Step 1: Define AI app catalog**

Create `src/lib/courseWorkspace/aiApps.ts`:

```ts
import type { CourseAiAppType } from "@/types/courseWorkspace";

export type CourseAiAppDefinition = {
  key: string;
  appType?: CourseAiAppType;
  title: string;
  description: string;
  category: "全部应用" | "备课中心" | "教学神器" | "学习助手" | "资料科研";
  color: "purple" | "blue" | "pink" | "orange" | "green";
  enabled: boolean;
};

export const courseAiApps: CourseAiAppDefinition[] = [
  { key: "resource-assistant", title: "资料助手", description: "AI助教右边的资料助手移动到这里啦！也可以通过页面右上角搜索使用", category: "资料科研", color: "purple", enabled: false },
  { key: "research-assistant", title: "AI科研助手", description: "闻见真知，道通天下", category: "资料科研", color: "purple", enabled: false },
  { key: "ai-question", appType: "question_generation", title: "AI出题", description: "AI出题，全面高效，精准把握知识点", category: "教学神器", color: "blue", enabled: true },
  { key: "ai-coach", title: "AI陪练", description: "个性化出题，助你巩固基础，突破难点", category: "学习助手", color: "blue", enabled: false },
  { key: "ai-paper", appType: "paper_assembly", title: "AI组卷", description: "召唤智能组卷小助手，三步生成优质试卷", category: "教学神器", color: "purple", enabled: true },
  { key: "ai-lesson-plan", appType: "lesson_plan", title: "AI教案", description: "AI辅助，智能备课，智慧教学新选择", category: "备课中心", color: "pink", enabled: true },
  { key: "program-test", title: "程序题自测", description: "实时评估编程技能，提升代码水平", category: "教学神器", color: "orange", enabled: false },
  { key: "ai-writing-review", title: "AI写作批阅", description: "基于人工智能技术，自动对学生的写作内容进行评分和反馈", category: "教学神器", color: "orange", enabled: false },
  { key: "ai-courseware", appType: "courseware", title: "AI课件", description: "轻松一点，即刻创建专业级教学PPT", category: "备课中心", color: "purple", enabled: true },
  { key: "formula-recognition", title: "公式识别", description: "识别图片和文档中的公式内容", category: "教学神器", color: "green", enabled: false },
  { key: "smart-numbering", title: "智能编号", description: "自动整理题目和材料编号", category: "教学神器", color: "blue", enabled: false },
  { key: "homework-check", title: "作业查重", description: "辅助发现作业中的重复内容", category: "教学神器", color: "green", enabled: false }
];
```

- [ ] **Step 2: Build AI workbench component**

`AiWorkbench.tsx` must render:

- Top pill tabs: `AI助教`, `AI应用`, `AI实践`, `AI学情分析`.
- `AI应用` active.
- Search box `AI智能检索资源`.
- Main rounded white card.
- Category tab row.
- Banner `AI应用开放平台 >`.
- Toolbar with `创建AI应用`, filter, batch, search.
- `AiAppGrid`.

The other top tabs can show a friendly local empty state if clicked, but `AI应用` must be the default and implemented.

- [ ] **Step 3: Build AI app cards**

`AiAppCard.tsx` must:

- Show icon-like colored square using CSS/lucide icons, not copied remote images.
- Show title and description.
- Enabled cards link to:
  - `/space/courses/[courseId]/ai-workbench/apps/question_generation`
  - `/space/courses/[courseId]/ai-workbench/apps/lesson_plan`
  - `/space/courses/[courseId]/ai-workbench/apps/courseware`
  - `/space/courses/[courseId]/ai-workbench/apps/paper_assembly`
- Disabled cards remain visible and show `暂未复刻` badge.

- [ ] **Step 4: Add AI workbench route**

Create `src/app/space/courses/[courseId]/ai-workbench/page.tsx`:

- Require user and course access.
- Render `FanyaCourseShell` with active tab `ai-workbench`.
- Render `AiWorkbench`.

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run build
```

Manual check:

- Open any course.
- Confirm AI workbench appears for all courses.
- Confirm `AI出题`, `AI教案`, `AI课件`, `AI组卷` are visible and clickable.

- [ ] **Step 6: Commit**

```bash
git add src/lib/courseWorkspace/aiApps.ts src/components/course-workspace src/app/space/courses/[courseId]/ai-workbench
git commit -m "feat: replicate AI application workbench"
```

## Task 4: Implement Four Requested AI App Workflows

**Files:**
- Create: `src/lib/courseWorkspace/generateAiArtifact.ts`
- Create: `src/app/api/courses/[courseId]/ai-apps/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-apps/[artifactId]/route.ts`
- Create: `src/app/space/courses/[courseId]/ai-workbench/apps/[appType]/page.tsx`
- Create: `src/components/course-workspace/AiAppGenerator.tsx`
- Modify: `tests/unit/courseAiApps.test.ts`

- [ ] **Step 1: Implement deterministic local generator**

Create `src/lib/courseWorkspace/generateAiArtifact.ts`:

- Input:

```ts
type GenerateCourseAiArtifactInput = {
  appType: CourseAiAppType;
  courseTitle: string;
  chapters: Array<{ title: string; lessons: Array<{ title: string; summary?: string | null }> }>;
  prompt?: string;
};
```

- For `question_generation`, generate 5 local questions from course chapter/lesson titles.
- For `lesson_plan`, generate objectives, key points, teaching process, assessment.
- For `courseware`, generate 6 slide objects.
- For `paper_assembly`, generate paper sections with question IDs or generated stems.

Keep it deterministic so tests are stable. Do not require OpenAI for this task.

- [ ] **Step 2: Implement AI app API**

Create `POST /api/courses/[courseId]/ai-apps`:

```ts
{
  appType: CourseAiAppType,
  title?: string,
  prompt?: string
}
```

Behavior:

- Requires course owner or teacher access. If students should use AI app later, leave that as a separate requirement; for this goal, teacher-only generation is acceptable.
- Loads course chapters/lessons.
- Calls `generateCourseAiArtifact`.
- Saves `CourseAiArtifact`.
- Returns artifact JSON.

Create `GET /api/courses/[courseId]/ai-apps?appType=...` to list artifacts.

Create `GET /api/courses/[courseId]/ai-apps/[artifactId]` to fetch one artifact with permission check.

- [ ] **Step 3: Build app detail page**

Create dynamic page:

`/space/courses/[courseId]/ai-workbench/apps/[appType]`

It must:

- Render Fanya course shell with `AI工作台` active.
- Show app title:
  - `AI出题`
  - `AI教案`
  - `AI课件`
  - `AI组卷`
- Show prompt textarea.
- Show generate button.
- Show prior generated artifacts.
- Show result preview:
  - questions list for AI出题.
  - teaching process table for AI教案.
  - slide list for AI课件.
  - paper structure for AI组卷.

- [ ] **Step 4: Build client generator component**

`AiAppGenerator.tsx` handles:

- Form submit to POST API.
- Loading state `生成中`.
- Error display.
- Result render.
- Refresh artifacts after success.

- [ ] **Step 5: Unit tests**

Update `tests/unit/courseAiApps.test.ts`:

- `question_generation` returns at least 5 questions.
- `lesson_plan` includes objectives and process phases.
- `courseware` returns at least 5 slides.
- `paper_assembly` returns title and sections.

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- tests/unit/courseAiApps.test.ts
npm run typecheck
```

Manual check:

- Click each requested AI app card.
- Generate one artifact.
- Confirm it persists after refresh.

- [ ] **Step 7: Commit**

```bash
git add src/lib/courseWorkspace/generateAiArtifact.ts src/app/api/courses/[courseId]/ai-apps src/app/space/courses/[courseId]/ai-workbench/apps src/components/course-workspace/AiAppGenerator.tsx tests/unit/courseAiApps.test.ts
git commit -m "feat: implement requested course AI apps"
```

## Task 5: Replicate All Course Sidebar Tabs

**Files:**
- Create: all route pages listed in File Structure for activities, courseware, lesson-plans, structure, resources, notices, discussions, assignments, exams, question-bank.
- Create: `src/components/course-workspace/CourseModulePanel.tsx`
- Modify: existing course builder/import links if needed.

- [ ] **Step 1: Create shared module panel**

Create `CourseModulePanel.tsx`:

```tsx
export function CourseModulePanel({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {actions}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Implement `班级活动`**

Route: `/space/courses/[courseId]/activities`

Show:

- activity cards,
- `签到`, `投票`, `抢答`, `讨论` controls as local cards,
- use seed/local derived data.

- [ ] **Step 3: Implement `课件`**

Route: `/space/courses/[courseId]/courseware`

Show:

- courseware resources from `Resource` where type includes courseware/file.
- link to `AI课件` generator.
- upload/add placeholder should be a working local form if resource upload API exists; otherwise link to drive attach flow.

- [ ] **Step 4: Implement `教案`**

Route: `/space/courses/[courseId]/lesson-plans`

Show:

- generated `lesson_plan` artifacts.
- link to `AI教案`.
- chapter/lesson context list.

- [ ] **Step 5: Implement `课程结构`**

Route: `/space/courses/[courseId]/structure`

Show:

- chapter tree from existing data.
- link to existing `/builder` for editing.

- [ ] **Step 6: Implement `资料`**

Route: `/space/courses/[courseId]/resources`

Show:

- course resources,
- drive attachments,
- download links with permission checks.

- [ ] **Step 7: Implement `通知`**

Route: `/space/courses/[courseId]/notices`

Show:

- announcements.
- teacher form to create local announcement if current user owns course.

- [ ] **Step 8: Implement `讨论`**

Route: `/space/courses/[courseId]/discussions`

Show:

- local course discussion list.
- If no dedicated model exists, add `CourseDiscussion`/`CourseDiscussionReply` or reuse group posts only if clearly scoped to course.

- [ ] **Step 9: Implement `作业`**

Route: `/space/courses/[courseId]/assignments`

Show:

- assignment cards,
- teacher create form,
- student status display.

If no model exists, add `CourseAssignment`.

- [ ] **Step 10: Implement `考试`**

Route: `/space/courses/[courseId]/exams`

Show:

- exam/paper list,
- AI组卷 artifacts,
- link to `AI组卷`.

- [ ] **Step 11: Implement `题库`**

Route: `/space/courses/[courseId]/question-bank`

Show:

- questions generated by AI出题 artifacts,
- filter by type,
- link to `AI出题`.

- [ ] **Step 12: Verify**

Run:

```bash
npm run typecheck
npm run build
```

Manual check:

- Click every course sidebar tab.
- No 404.
- Active sidebar state is correct.
- Each page has meaningful local content or forms.

- [ ] **Step 13: Commit**

```bash
git add src/app/space/courses/[courseId] src/components/course-workspace prisma
git commit -m "feat: replicate Fanya course sidebar modules"
```

## Task 6: UI-Level E2E Tests For Course Workspace

**Files:**
- Create: `tests/e2e/course-workspace.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `playwright.config.ts` only if port/clean setup requires it.

- [ ] **Step 1: Add course entry test**

`tests/e2e/course-workspace.spec.ts` must:

- Login as teacher using the current formal login helper.
- Go to `/space/courses`.
- Click the first visible course card or `进入课程`.
- Expect URL to match `/space/courses/.+/ai-workbench`.
- Assert `泛雅`, course title, `AI工作台`, `班级活动`, `课件`, `教案`, `课程结构`, `资料`, `通知`, `讨论`, `作业`, `考试`, `题库`.

- [ ] **Step 2: Add AI 应用 page test**

Test:

- Assert `AI应用` active.
- Assert `全部应用`, `备课中心`, `教学神器`, `学习助手`, `资料科研`.
- Assert visible app cards:
  - `AI出题`
  - `AI教案`
  - `AI课件`
  - `AI组卷`

- [ ] **Step 3: Add four AI app workflow tests**

For each app:

- Click card.
- Fill prompt textarea.
- Click generate.
- Assert generated result preview appears.
- Reload page.
- Assert generated artifact remains visible.

Apps:

- `AI出题`
- `AI教案`
- `AI课件`
- `AI组卷`

- [ ] **Step 4: Add sidebar navigation test**

Click every sidebar tab and assert:

- URL changes to expected route.
- Active state moves.
- Page heading matches tab.

- [ ] **Step 5: Run E2E**

Run:

```bash
npm run test:e2e -- tests/e2e/course-workspace.spec.ts
```

Expected: all tests pass through UI interactions, not direct `fetch`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/course-workspace.spec.ts tests/e2e/helpers.ts playwright.config.ts
git commit -m "test: cover Fanya course workspace UI"
```

## Task 7: Final Verification

**Files:**
- Modify: `docs/verification/2026-05-26-course-fanya-ai-workbench.md`

- [ ] **Step 1: Run clean checks**

Run:

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 2: Visual check**

Start the app:

```bash
npm run dev -- --port 3000
```

Open:

- `/space/courses`
- click a course
- `/space/courses/[courseId]/ai-workbench`

Verify:

- It resembles the second screenshot structurally.
- All courses show AI 工作台.
- The four requested AI app cards work.
- All course-sidebar tabs route correctly.

- [ ] **Step 3: Create verification note**

Create `docs/verification/2026-05-26-course-fanya-ai-workbench.md`:

```md
# Course Fanya AI Workbench Verification

## Commands

- npm run typecheck
- npm run test
- npm run build
- npm run test:e2e

## Manual Checks

- Course card opens Fanya workspace.
- AI应用 tab contains AI出题, AI教案, AI课件, AI组卷.
- Four requested AI apps generate and persist artifacts.
- All course sidebar tabs render.

## Known Limits

- UI is structurally close but not pixel-perfect.
- Disabled AI app cards outside the requested four are visible but not implemented.
```

- [ ] **Step 4: Commit**

```bash
git add docs/verification/2026-05-26-course-fanya-ai-workbench.md
git commit -m "docs: verify Fanya AI workbench replica"
```

## Acceptance Criteria

- Clicking any course from `/space/courses` opens `/space/courses/[courseId]/ai-workbench`.
- The opened page visually and structurally matches the second screenshot's Fanya course workspace.
- Every course has the `AI工作台` left-sidebar tab.
- The course left sidebar includes every visible tab from the second screenshot:
  - `AI工作台`
  - `班级活动`
  - `课件`
  - `教案`
  - `课程结构`
  - `资料`
  - `通知`
  - `讨论`
  - `作业`
  - `考试`
  - `题库`
- The AI workbench top tabs include:
  - `AI助教`
  - `AI应用`
  - `AI实践`
  - `AI学情分析`
- `AI应用` is active by default and shows the application grid.
- `AI出题`, `AI教案`, `AI课件`, and `AI组卷` are fully clickable and generate persisted local artifacts.
- Other AI app cards may be displayed but are clearly disabled/read-only.
- Existing `AI 文档建课` and course builder routes still work.
- `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e` pass.

## Goal Execution Prompt

Use this prompt in the new Codex goal session:

```text
Create and execute a Codex goal to complete D:\download\pic-vec\chaoxing\docs\superpowers\plans\2026-05-26-course-fanya-ai-workbench-replica.md.

Do not restart the project. Build on the current Next.js/Prisma implementation. The requirement is: clicking any course must open a Fanya-style course workspace like the provided second screenshot; all courses must include AI工作台; the left sidebar tabs must be replicated; in AI工作台 > AI应用, fully implement AI出题, AI教案, AI课件, and AI组卷. Keep existing AI文档建课 and course builder working. Run tests after each task and continue until all acceptance criteria pass.
```

## Self-Review

- Spec coverage: This plan covers course-entry behavior, Fanya course shell, all visible course sidebar tabs, AI workbench top tabs, AI 应用 grid, and the four requested AI app workflows.
- Static-page scan: The four requested AI apps require working generation and persistence. Other sidebar tabs get meaningful local pages and no 404s.
- Type consistency: `CourseAiAppType`, route paths, app labels, and Prisma model names are consistent across tasks.
