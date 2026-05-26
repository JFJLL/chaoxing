# Yimei AI Course Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functionally equivalent self-hosted Yimei-style learning space with full front-end/back-end flows for the visible modules, plus an AI workflow that uploads a document, extracts content, calls an LLM, and turns it into a full course directory.

**Architecture:** Create a Next.js full-stack app with a server-side data model, local SQLite persistence, authenticated teacher/student views, and job-style workflows for document import, plagiarism checks, cloud-drive actions, messaging, groups, notes, topics, contacts, and live-room sessions. The UI only needs to preserve the same information architecture and interaction meaning as Yimei; visual details do not need pixel-level parity.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Prisma, SQLite, NextAuth-style local session cookie, Zod, React Hook Form, Vitest, Playwright, OpenAI-compatible chat API, Mammoth/PDF text extraction helpers.

---

## Observed Product Baseline

The current logged-in site shows:

- Header: institution name "文化产院管理学院", invite-code entry, user avatar/name menu.
- Left nav: 首页, 专题创作, 课程, 收件箱, 小组, 笔记, 通讯录, 云盘, 论文检测, 个人直播间.
- Course iframe area: tabs "我学的课" and "我教的课"; actions "添加课程/新建课程" and "新建文件夹"; cards with cover image, progress, teacher, date.
- Teacher tab: existing taught courses, but no visible "上传文档 -> 大模型拆课程目录" feature in the inspected pages.
- Topic creation: "新建专题", "新建文件夹", "全部专题", empty state.

This project should preserve that product shape and implement local functional equivalents for the visible modules. The AI document-to-course-directory capability is an added teacher-side feature layered into the course-building flow.

## Functional Parity Definition

"功能上一样" means the replica must provide working front-end and back-end behavior for the same visible product areas, using local data and self-hosted services. It does not mean calling Yimei private APIs or copying protected assets.

Required functional areas:

- Authentication and organization space: login/logout, user menu, role switching, institution context, invite-code entry, account profile.
- Course learning: learned course list, progress display, course homepage, chapter/lesson/resource browsing, task-point completion, announcements, help entry.
- Course teaching: taught course list, create course, create folder, edit course profile, manage chapters/lessons/resources, publish/unpublish, deleted-course recovery, student progress view.
- AI document course creation: upload document, extract text, generate course directory, review/edit generated outline, apply to course builder, audit import history.
- Topic creation: create folders, create topics, add sections/resources, publish/unpublish, search/filter.
- Inbox: send messages, receive messages, mark read/unread, delete/archive, view message detail.
- Groups: create group, join by invite code, post discussions, comment, upload group files, member list.
- Notes: create/edit/delete notes, search notes, tag notes, optionally link a note to a course/lesson.
- Contacts: search contacts, view profile cards, group by institution/role, start message from contact.
- Cloud drive: folder tree, upload/download, rename/move/delete files, share link, attach drive file to course resource.
- Plagiarism detection: submit document, create check job, show status/history, generate a deterministic local similarity report.
- Personal live room: create/schedule live session, open teacher room, open viewer page, basic chat, session history. Use a local browser-based room; production-scale streaming is not required.

## Scope

### In Scope

- Functionally equivalent modules for the inspected personal-space navigation.
- Yimei-like shell layout for the inspected personal-space pages without pixel-level matching.
- Local login/session simulation with seeded users and institution.
- Student and teacher course lists.
- Teacher course workspace with chapters, lessons, resources, and publish state.
- Document upload flow for `.docx`, `.txt`, `.md`, and `.pdf`.
- Server-side document text extraction.
- LLM-based outline generation into a course directory.
- Review/edit/approve screen before committing generated chapters.
- Import job states: queued, extracting, generating, ready_for_review, applied, failed.
- Mock fallback generator when no API key is configured.
- Local implementations for inbox, groups, notes, contacts, cloud drive, plagiarism detection, topic creation, and personal live room.
- Seed data matching the inspected account and courses.
- Tests for parser, LLM schema handling, import pipeline, and core UI flows.

### Out of Scope

- Integrating with real Yimei APIs.
- Copying private assets from Yimei servers.
- Real payment, SMS, real identity verification, or production SSO.
- Calling real Yimei APIs or syncing with a real Yimei account.
- Production-scale video CDN, TURN infrastructure, or multi-host broadcast reliability.

## File Structure

- Create: `package.json` - scripts, dependencies, and runtime metadata.
- Create: `next.config.ts` - Next.js config.
- Create: `tsconfig.json` - TypeScript config.
- Create: `postcss.config.mjs` - Tailwind PostCSS config.
- Create: `tailwind.config.ts` - design tokens matching the Yimei-style shell.
- Create: `.env.example` - local environment variables.
- Create: `.gitignore` - generated files and local secrets.
- Create: `prisma/schema.prisma` - data model for users, roles, courses, chapters, resources, imports, topics, inbox, groups, notes, contacts, drive, plagiarism, live rooms, invite codes, and audit logs.
- Create: `prisma/seed.ts` - seed institution, users, courses, chapters, module data, and sample import.
- Create: `src/app/layout.tsx` - app root shell.
- Create: `src/app/page.tsx` - redirect to `/space`.
- Create: `src/app/login/page.tsx` - local role login.
- Create: `src/app/space/layout.tsx` - authenticated Yimei-style shell.
- Create: `src/app/space/page.tsx` - home dashboard.
- Create: `src/app/space/courses/page.tsx` - course list with learned/taught tabs.
- Create: `src/app/space/courses/[courseId]/page.tsx` - teacher/student course overview.
- Create: `src/app/space/courses/[courseId]/builder/page.tsx` - chapter builder.
- Create: `src/app/space/courses/[courseId]/ai-import/page.tsx` - upload and import status page.
- Create: `src/app/space/courses/[courseId]/ai-import/[jobId]/page.tsx` - generated outline review.
- Create: `src/app/space/topics/page.tsx` - functional topic/folder/resource management.
- Create: `src/app/space/inbox/page.tsx`, `src/app/space/groups/page.tsx`, `src/app/space/notes/page.tsx`, `src/app/space/contacts/page.tsx`, `src/app/space/drive/page.tsx`, `src/app/space/plagiarism/page.tsx`, `src/app/space/live/page.tsx` - functional modules backed by local APIs and database tables.
- Create: `src/app/api/auth/login/route.ts` - local login.
- Create: `src/app/api/auth/logout/route.ts` - logout.
- Create: `src/app/api/courses/route.ts` - list/create courses.
- Create: `src/app/api/courses/[courseId]/outline/route.ts` - read/update course outline.
- Create: `src/app/api/courses/[courseId]/ai-import/route.ts` - create import job from uploaded document.
- Create: `src/app/api/ai-import/[jobId]/route.ts` - get job status and generated outline.
- Create: `src/app/api/ai-import/[jobId]/apply/route.ts` - apply reviewed outline to course.
- Create: `src/app/api/invite/route.ts` - process invite codes for courses, groups, drive shares, and live rooms.
- Create: `src/app/api/topics/route.ts`, `src/app/api/topics/[topicId]/route.ts` - topic/folder CRUD and publish state.
- Create: `src/app/api/inbox/route.ts`, `src/app/api/inbox/[messageId]/route.ts` - message list/send/read/archive/delete.
- Create: `src/app/api/groups/route.ts`, `src/app/api/groups/[groupId]/route.ts`, `src/app/api/groups/[groupId]/posts/route.ts` - group membership, posts, comments, files.
- Create: `src/app/api/notes/route.ts`, `src/app/api/notes/[noteId]/route.ts` - notes CRUD, tags, course/lesson links.
- Create: `src/app/api/contacts/route.ts` - searchable institution contacts.
- Create: `src/app/api/drive/route.ts`, `src/app/api/drive/[fileId]/route.ts`, `src/app/api/drive/[fileId]/share/route.ts` - cloud-drive folder and file operations.
- Create: `src/app/api/plagiarism/route.ts`, `src/app/api/plagiarism/[checkId]/route.ts` - document check jobs and reports.
- Create: `src/app/api/live/route.ts`, `src/app/api/live/[sessionId]/route.ts`, `src/app/api/live/[sessionId]/chat/route.ts` - live-room scheduling, room state, and chat.
- Create: `src/components/shell/SpaceHeader.tsx` - top header.
- Create: `src/components/shell/SpaceSidebar.tsx` - left navigation.
- Create: `src/components/shell/UserMenu.tsx` - account dropdown.
- Create: `src/components/courses/CourseCard.tsx` - course list card.
- Create: `src/components/courses/CourseTabs.tsx` - learned/taught tab switch.
- Create: `src/components/courses/ChapterTree.tsx` - editable course directory tree.
- Create: `src/components/ai-import/UploadPanel.tsx` - upload UI.
- Create: `src/components/ai-import/ImportTimeline.tsx` - job progress.
- Create: `src/components/ai-import/OutlineReviewEditor.tsx` - generated outline review.
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Dialog.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/ui/Badge.tsx` - local UI primitives.
- Create: `src/lib/auth.ts` - cookie session helpers.
- Create: `src/lib/db.ts` - Prisma client singleton.
- Create: `src/lib/permissions.ts` - role and course ownership checks.
- Create: `src/lib/storage.ts` - local upload file storage.
- Create: `src/lib/document/extractText.ts` - route document type to extractor.
- Create: `src/lib/document/extractDocx.ts` - `.docx` text extraction.
- Create: `src/lib/document/extractPdf.ts` - `.pdf` text extraction.
- Create: `src/lib/document/normalizeText.ts` - cleanup and chunking.
- Create: `src/lib/ai/courseOutlineSchema.ts` - Zod schema for generated outline.
- Create: `src/lib/ai/generateCourseOutline.ts` - OpenAI-compatible and fallback generator.
- Create: `src/lib/ai/prompts.ts` - prompt builder.
- Create: `src/lib/imports/runImportJob.ts` - import job orchestration.
- Create: `src/lib/imports/applyOutline.ts` - persist reviewed outline into chapters/lessons/resources.
- Create: `src/types/course.ts` - shared course directory types.
- Create: `tests/unit/document.test.ts` - parser and normalization tests.
- Create: `tests/unit/aiOutline.test.ts` - LLM schema and fallback tests.
- Create: `tests/unit/importPipeline.test.ts` - job orchestration tests.
- Create: `tests/e2e/space.spec.ts` - shell, course list, and navigation tests.
- Create: `tests/e2e/ai-import.spec.ts` - upload-to-review-to-apply flow.
- Create: `tests/e2e/modules.spec.ts` - functional coverage for invite code, topics, inbox, groups, notes, contacts, drive, plagiarism, and live room.

## Data Model

Core Prisma entities:

- `Institution`: name and branding.
- `User`: name, avatar, role, institution membership.
- `Course`: title, cover, owner, term dates, taught/learned relation, status.
- `CourseEnrollment`: student progress.
- `Chapter`: ordered tree node for generated or manual course directory.
- `Lesson`: child item under chapter.
- `Resource`: uploaded or generated resource reference.
- `DocumentImportJob`: upload metadata, extracted text, generated JSON, status, error.
- `InviteCode`: maps codes to courses, groups, drive shares, live sessions, or institution roles.
- `Topic`, `TopicFolder`, `TopicSection`, `TopicResource`: topic creation and publishing.
- `Message`: inbox sender/receiver, read/archive/delete state.
- `Group`, `GroupMember`, `GroupPost`, `GroupComment`, `GroupFile`: group collaboration.
- `Note`, `NoteTag`: user notes with optional course/lesson links.
- `DriveFile`, `DriveShare`: local cloud-drive folders/files and share links.
- `PlagiarismCheck`: uploaded document, status, similarity score, report JSON.
- `LiveSession`, `LiveParticipant`, `LiveChatMessage`: local personal live-room flow.
- `Announcement` and `HelpTicket`: course announcements and support/help entries.
- `AuditLog`: records import/apply events.

Course outline JSON contract:

```ts
export type GeneratedCourseOutline = {
  title: string;
  description: string;
  targetAudience: string;
  learningObjectives: string[];
  chapters: Array<{
    title: string;
    summary: string;
    order: number;
    lessons: Array<{
      title: string;
      summary: string;
      order: number;
      estimatedMinutes: number;
      keyPoints: string[];
      suggestedActivities: string[];
      assessmentPrompts: string[];
    }>;
  }>;
};
```

## UX Contract

- The first screen after login is the personal-space shell, not a marketing page.
- Left nav visually matches the inspected site: fixed blue panel, avatar card, active row, collapse chevron.
- The course page must feel like an embedded app area: white content panel, top tabs, pill action buttons, course cards.
- Teacher users see "AI 文档建课" on taught course cards and inside the course builder.
- AI import flow has four screens/states: upload, progress, review, applied.
- Generated directory is never applied blindly; teacher reviews first.
- If `OPENAI_API_KEY` is absent, the app clearly uses local mock generation but keeps the same UX.

## Task 1: Bootstrap Project

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Create project config files**

Create `package.json`:

```json
{
  "name": "yimei-ai-course-platform",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1",
    "build": "next build",
    "start": "next start --hostname 127.0.0.1",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "bcryptjs": "^2.4.3",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "mammoth": "^1.8.0",
    "next": "^15.0.0",
    "openai": "^4.73.0",
    "pdf-parse": "^1.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.53.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.10.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "prisma": "^5.22.0",
    "tailwindcss": "^3.4.16",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `.env.example`:

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-with-local-dev-secret"
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
UPLOAD_DIR="./.uploads"
```

Create `.gitignore`:

```gitignore
node_modules
.next
.env
.uploads
prisma/dev.db
prisma/dev.db-journal
coverage
test-results
playwright-report
```

- [ ] **Step 2: Create TypeScript, Next, and Tailwind config**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb"
    }
  }
};

export default nextConfig;
```

Create `tsconfig.json`, `postcss.config.mjs`, and `tailwind.config.ts` with standard Next.js TypeScript settings and Tailwind content paths `./src/**/*.{ts,tsx}`.

- [ ] **Step 3: Create root layout and redirect**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人空间",
  description: "Yimei-style AI course platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/space");
}
```

- [ ] **Step 4: Install and verify bootstrap**

Run:

```bash
npm install
npm run typecheck
```

Expected: dependencies install, `typecheck` passes or only reports missing source files already planned in later tasks.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts .env.example .gitignore src/app
git commit -m "chore: bootstrap next app"
```

If this workspace is not yet a git repository, run `git init` before the commit.

## Task 2: Database, Seed Data, and Auth

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/permissions.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Write Prisma schema**

Create models for the whole functional system, not only the course shell: `Institution`, `User`, `Course`, `CourseEnrollment`, `Chapter`, `Lesson`, `Resource`, `DocumentImportJob`, `InviteCode`, `TopicFolder`, `Topic`, `TopicSection`, `TopicResource`, `Message`, `Group`, `GroupMember`, `GroupPost`, `GroupComment`, `GroupFile`, `Note`, `NoteTag`, `DriveFile`, `DriveShare`, `PlagiarismCheck`, `LiveSession`, `LiveParticipant`, `LiveChatMessage`, `Announcement`, `HelpTicket`, and `AuditLog`. Use string cuid IDs, `createdAt`, and `updatedAt`. Add enums:

```prisma
enum UserRole {
  STUDENT
  TEACHER
  ADMIN
}

enum CourseStatus {
  DRAFT
  ACTIVE
  ENDED
  ARCHIVED
}

enum ImportStatus {
  QUEUED
  EXTRACTING
  GENERATING
  READY_FOR_REVIEW
  APPLIED
  FAILED
}

enum InviteCodeKind {
  COURSE
  GROUP
  DRIVE_SHARE
  LIVE_SESSION
}

enum PublishStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum PlagiarismStatus {
  QUEUED
  CHECKING
  COMPLETED
  FAILED
}

enum LiveStatus {
  SCHEDULED
  LIVE
  ENDED
  CANCELED
}
```

- [ ] **Step 2: Add seed data**

Seed:

- Institution: `文化产院管理学院`
- Teacher user: `李素艳`
- Teacher user: `王一帆`
- Student demo user: `学习者`
- Courses: `动手学AI：人工智能通识与实践（社科版）`, `功能体验课`, `实操课`, `文化市场营销学`
- Chapters for `功能体验课`: two sample chapters with two lessons each.
- Invite codes for one course, one group, one drive share, and one live session.
- Functional data for topics, inbox messages, groups/posts/comments, notes/tags, contacts, drive files, plagiarism reports, live sessions, announcements, and help tickets.

- [ ] **Step 3: Add DB and auth helpers**

Create `src/lib/db.ts` with a Prisma singleton.

Create `src/lib/auth.ts` with:

```ts
export type SessionUser = {
  id: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  institutionId: string;
};

export async function getCurrentUser(): Promise<SessionUser | null>;
export async function requireUser(): Promise<SessionUser>;
export async function setSession(user: SessionUser): Promise<void>;
export async function clearSession(): Promise<void>;
```

Use an HTTP-only cookie named `cx_session`. Store a signed JSON payload using `SESSION_SECRET`.

- [ ] **Step 4: Add login/logout routes and login page**

`POST /api/auth/login` accepts `{ userId: string }`, validates the seeded user, and sets the session cookie.

`POST /api/auth/logout` clears the session cookie.

`/login` shows three role buttons for the seeded users. This is a developer login screen, not a public marketing page.

- [ ] **Step 5: Verify database and auth**

Run:

```bash
cp .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run typecheck
```

Expected: Prisma client generated, local SQLite DB created, seed prints seeded users and courses, typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib src/app/api/auth src/app/login .env.example
git commit -m "feat: add local auth and seeded data"
```

## Task 3: Yimei-Style Shell UI

**Files:**
- Create: `src/app/space/layout.tsx`
- Create: `src/app/space/page.tsx`
- Create: `src/components/shell/SpaceHeader.tsx`
- Create: `src/components/shell/SpaceSidebar.tsx`
- Create: `src/components/shell/UserMenu.tsx`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Dialog.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/EmptyState.tsx`
- Create: `src/components/ui/Badge.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Implement global visual tokens**

Define the main shell colors:

```css
:root {
  --cx-blue: #5669c9;
  --cx-blue-dark: #485ab7;
  --cx-active: #6376db;
  --cx-page: #f4f6fb;
  --cx-border: #e7eaf3;
  --cx-text: #1f2937;
  --cx-muted: #7b8190;
}
```

Use `font-family: Arial, "Microsoft YaHei", sans-serif;`.

- [ ] **Step 2: Build header and sidebar**

`SpaceHeader` renders:

- Institution text on the left.
- Search type "超星发现" hidden under desktop width if needed.
- "输入邀请码".
- Avatar, user name, dropdown with "账号管理", "切换单位/角色", "退出空间".

`SpaceSidebar` renders the exact nav list from the observed page with lucide icons and active route highlighting.

- [ ] **Step 3: Build authenticated shell layout**

`src/app/space/layout.tsx` calls `requireUser()` and wraps children in:

- Fixed top header height `80px`.
- Left nav width `220px`.
- Content area with white embedded panel feel.

- [ ] **Step 4: Add dashboard page**

`/space` shows the course list preview and quick actions. It should redirect visually toward `/space/courses` content, matching the inspected default home behavior.

- [ ] **Step 5: Verify shell**

Run:

```bash
npm run dev
```

Open `http://127.0.0.1:3000/login`, log in as `李素艳`, then verify `/space` visually matches the inspected page shell.

- [ ] **Step 6: Commit**

```bash
git add src/app/space src/components src/app/globals.css
git commit -m "feat: recreate personal space shell"
```

## Task 4: Course List and Teacher Workspace Entry

**Files:**
- Create: `src/app/space/courses/page.tsx`
- Create: `src/app/api/courses/route.ts`
- Create: `src/components/courses/CourseCard.tsx`
- Create: `src/components/courses/CourseTabs.tsx`
- Create: `src/components/courses/NewCourseDialog.tsx`
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Implement course API**

`GET /api/courses?tab=learned|taught` returns courses visible to current user.

`POST /api/courses` accepts:

```ts
{
  title: string;
  coverStyle: "document" | "tool" | "ai" | "plain";
  startsAt?: string;
  endsAt?: string;
}
```

Only `TEACHER` or `ADMIN` can create courses.

- [ ] **Step 2: Build course page**

Render tabs:

- `我学的课`
- `我教的课`

Actions:

- Student tab: `添加课程`, `新建文件夹`
- Teacher tab: `新建课程`, `新建文件夹`

Teacher course cards include a primary action `AI 文档建课` linking to `/space/courses/[courseId]/ai-import`.

- [ ] **Step 3: Build course card**

The card shows:

- Cover image block generated by CSS gradients and labels, not copied from Yimei assets.
- Badge `教` for taught courses.
- Title, owner, term, progress if learned.
- Secondary links: `课程建设`, `AI 文档建课`.

- [ ] **Step 4: Verify course lists**

Run:

```bash
npm run typecheck
npm run dev
```

Expected:

- `李素艳` sees taught courses.
- `学习者` sees learned course progress.
- Teacher tab contains `AI 文档建课`.

- [ ] **Step 5: Commit**

```bash
git add src/app/space/courses src/app/api/courses src/components/courses src/lib/permissions.ts
git commit -m "feat: add course lists and teacher entries"
```

## Task 5: Course Builder

**Files:**
- Create: `src/app/space/courses/[courseId]/page.tsx`
- Create: `src/app/space/courses/[courseId]/builder/page.tsx`
- Create: `src/app/api/courses/[courseId]/outline/route.ts`
- Create: `src/components/courses/ChapterTree.tsx`
- Create: `src/types/course.ts`
- Create: `src/lib/imports/applyOutline.ts`

- [ ] **Step 1: Define shared outline types**

Create `src/types/course.ts` using the `GeneratedCourseOutline` contract from this plan plus persisted types:

```ts
export type CourseDirectoryNode = {
  id: string;
  title: string;
  summary: string;
  order: number;
  lessons: CourseLessonNode[];
};

export type CourseLessonNode = {
  id: string;
  title: string;
  summary: string;
  order: number;
  estimatedMinutes: number;
  keyPoints: string[];
  suggestedActivities: string[];
  assessmentPrompts: string[];
};
```

- [ ] **Step 2: Implement outline read/update API**

`GET /api/courses/[courseId]/outline` returns chapters and lessons ordered by `order`.

`PUT /api/courses/[courseId]/outline` accepts a full directory tree and replaces current draft chapters inside a DB transaction. Only course owner/admin can update.

- [ ] **Step 3: Build course overview and builder**

Course overview shows:

- Course title and status.
- Buttons: `课程建设`, `AI 文档建课`, `发布课程`.
- Current chapter count and lesson count.

Builder page shows editable `ChapterTree` with add, rename, reorder, and delete actions. Keep editing simple and reliable; no drag/drop in v1.

- [ ] **Step 4: Verify builder**

Run:

```bash
npm run typecheck
```

Manual check:

- Open a teacher course.
- Add one chapter and one lesson.
- Refresh and confirm persistence.

- [ ] **Step 5: Commit**

```bash
git add src/app/space/courses/[courseId] src/app/api/courses/[courseId] src/components/courses/ChapterTree.tsx src/types/course.ts src/lib/imports/applyOutline.ts
git commit -m "feat: add course builder"
```

## Task 6: Document Upload and Extraction

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/document/extractText.ts`
- Create: `src/lib/document/extractDocx.ts`
- Create: `src/lib/document/extractPdf.ts`
- Create: `src/lib/document/normalizeText.ts`
- Create: `src/app/api/courses/[courseId]/ai-import/route.ts`
- Create: `tests/unit/document.test.ts`

- [ ] **Step 1: Write document normalization tests**

Test cases:

- Collapses repeated whitespace.
- Removes page-number-only lines.
- Splits long text into chunks under 12,000 characters.
- Rejects empty extracted text.

- [ ] **Step 2: Implement extractors**

`extractText(filePath, mimeType)` routes:

- `.txt`, `.md`: read UTF-8.
- `.docx`: use `mammoth.extractRawText`.
- `.pdf`: use `pdf-parse`.

Return:

```ts
export type ExtractedDocument = {
  text: string;
  pages?: number;
  wordCount: number;
  chunks: string[];
};
```

- [ ] **Step 3: Implement upload storage**

`storage.ts` creates `UPLOAD_DIR`, stores files by import job ID, preserves original extension, and blocks unsupported extensions.

- [ ] **Step 4: Implement import creation API**

`POST /api/courses/[courseId]/ai-import`:

- Requires teacher ownership.
- Accepts multipart `file`.
- Creates `DocumentImportJob` with `QUEUED`.
- Stores file.
- Runs `runImportJob(jobId)` synchronously for local v1, then returns job ID.

Synchronous is acceptable for this local replica; the schema still models real job states.

- [ ] **Step 5: Verify extraction**

Run:

```bash
npm run test -- tests/unit/document.test.ts
npm run typecheck
```

Expected: document tests pass, upload route typechecks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/lib/document src/app/api/courses/[courseId]/ai-import tests/unit/document.test.ts
git commit -m "feat: add document upload and extraction"
```

## Task 7: LLM Course Outline Generation

**Files:**
- Create: `src/lib/ai/courseOutlineSchema.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/lib/ai/generateCourseOutline.ts`
- Create: `src/lib/imports/runImportJob.ts`
- Create: `src/app/api/ai-import/[jobId]/route.ts`
- Create: `tests/unit/aiOutline.test.ts`
- Create: `tests/unit/importPipeline.test.ts`

- [ ] **Step 1: Write schema tests**

Validate:

- Correct outline passes.
- Missing chapter title fails.
- Empty lesson list fails.
- Invalid JSON from model falls back to deterministic mock with warning.

- [ ] **Step 2: Implement Zod schema**

`courseOutlineSchema.ts` exports:

```ts
export const generatedCourseOutlineSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  targetAudience: z.string().min(2),
  learningObjectives: z.array(z.string().min(2)).min(3),
  chapters: z.array(z.object({
    title: z.string().min(2),
    summary: z.string().min(5),
    order: z.number().int().positive(),
    lessons: z.array(z.object({
      title: z.string().min(2),
      summary: z.string().min(5),
      order: z.number().int().positive(),
      estimatedMinutes: z.number().int().min(5).max(180),
      keyPoints: z.array(z.string().min(2)).min(2),
      suggestedActivities: z.array(z.string().min(2)).min(1),
      assessmentPrompts: z.array(z.string().min(2)).min(1)
    })).min(1)
  })).min(3)
});
```

- [ ] **Step 3: Implement prompt builder**

Prompt requirements:

- Output strict JSON only.
- Generate 6-12 chapters where possible.
- Each chapter has 2-5 lessons.
- Use Chinese titles.
- Preserve domain terminology from the uploaded document.
- Do not invent citations or page numbers.

- [ ] **Step 4: Implement generator**

`generateCourseOutline(input)`:

```ts
type GenerateCourseOutlineInput = {
  courseTitle: string;
  documentText: string;
  chunks: string[];
  model?: string;
};
```

If `OPENAI_API_KEY` exists, call OpenAI-compatible chat completions with JSON response instructions. If absent or invalid, return a deterministic fallback outline based on document headings and first paragraphs.

- [ ] **Step 5: Implement import job runner**

`runImportJob(jobId)` transitions:

1. `EXTRACTING`
2. Save `extractedText`
3. `GENERATING`
4. Save `generatedOutline`
5. `READY_FOR_REVIEW`

On error, set `FAILED` and persist a readable `errorMessage`.

- [ ] **Step 6: Verify AI pipeline**

Run:

```bash
npm run test -- tests/unit/aiOutline.test.ts tests/unit/importPipeline.test.ts
npm run typecheck
```

Expected: all AI pipeline unit tests pass using fallback mode without API key.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai src/lib/imports/runImportJob.ts src/app/api/ai-import tests/unit/aiOutline.test.ts tests/unit/importPipeline.test.ts
git commit -m "feat: generate course outlines from documents"
```

## Task 8: AI Import UI

**Files:**
- Create: `src/app/space/courses/[courseId]/ai-import/page.tsx`
- Create: `src/app/space/courses/[courseId]/ai-import/[jobId]/page.tsx`
- Create: `src/app/api/ai-import/[jobId]/apply/route.ts`
- Create: `src/components/ai-import/UploadPanel.tsx`
- Create: `src/components/ai-import/ImportTimeline.tsx`
- Create: `src/components/ai-import/OutlineReviewEditor.tsx`

- [ ] **Step 1: Build upload panel**

The page title is `AI 文档建课`.

Accepted file copy:

- `支持 DOCX、PDF、TXT、Markdown`
- `系统会先解析文档，再生成课程目录，确认后才写入课程`

Upload control must show file name, size, and disabled state while submitting.

- [ ] **Step 2: Build import timeline**

Timeline states:

- `文档上传`
- `内容解析`
- `目录生成`
- `等待确认`
- `已应用`

Failed state shows persisted error and a retry link back to upload page.

- [ ] **Step 3: Build review editor**

The review page shows:

- Generated course title and description.
- Learning objectives.
- Chapter/lesson tree.
- Inline edit fields for chapter and lesson titles.
- Delete lesson/chapter buttons.
- `应用到课程` button.

- [ ] **Step 4: Implement apply route**

`POST /api/ai-import/[jobId]/apply` accepts edited outline JSON, validates schema, writes chapters/lessons in transaction, marks import job `APPLIED`, and creates an audit log.

- [ ] **Step 5: Verify end-to-end manually**

Create a local `sample-course.md`:

```md
# 数字阅读服务培训

## 第一章 服务认知
读者需求、馆藏资源、线上线下服务入口。

## 第二章 活动策划
活动目标、用户分层、宣传渠道、复盘指标。

## 第三章 数据分析
借阅数据、访问数据、用户反馈、改进策略。
```

Upload it through `AI 文档建课`, review generated directory, apply it, then confirm the course builder shows the generated chapters.

- [ ] **Step 6: Commit**

```bash
git add src/app/space/courses/[courseId]/ai-import src/app/api/ai-import/[jobId]/apply src/components/ai-import
git commit -m "feat: add AI document course creation UI"
```

## Task 9: Functional Secondary Modules

**Files:**
- Create: `src/app/space/topics/page.tsx`
- Create: `src/app/space/inbox/page.tsx`
- Create: `src/app/space/groups/page.tsx`
- Create: `src/app/space/notes/page.tsx`
- Create: `src/app/space/contacts/page.tsx`
- Create: `src/app/space/drive/page.tsx`
- Create: `src/app/space/plagiarism/page.tsx`
- Create: `src/app/space/live/page.tsx`
- Create: `src/app/api/invite/route.ts`
- Create: `src/app/api/topics/route.ts`
- Create: `src/app/api/topics/[topicId]/route.ts`
- Create: `src/app/api/inbox/route.ts`
- Create: `src/app/api/inbox/[messageId]/route.ts`
- Create: `src/app/api/groups/route.ts`
- Create: `src/app/api/groups/[groupId]/route.ts`
- Create: `src/app/api/groups/[groupId]/posts/route.ts`
- Create: `src/app/api/notes/route.ts`
- Create: `src/app/api/notes/[noteId]/route.ts`
- Create: `src/app/api/contacts/route.ts`
- Create: `src/app/api/drive/route.ts`
- Create: `src/app/api/drive/[fileId]/route.ts`
- Create: `src/app/api/drive/[fileId]/share/route.ts`
- Create: `src/app/api/plagiarism/route.ts`
- Create: `src/app/api/plagiarism/[checkId]/route.ts`
- Create: `src/app/api/live/route.ts`
- Create: `src/app/api/live/[sessionId]/route.ts`
- Create: `src/app/api/live/[sessionId]/chat/route.ts`
- Create: `src/components/modules/TopicManager.tsx`
- Create: `src/components/modules/InboxClient.tsx`
- Create: `src/components/modules/GroupWorkspace.tsx`
- Create: `src/components/modules/NotesClient.tsx`
- Create: `src/components/modules/ContactsDirectory.tsx`
- Create: `src/components/modules/DriveClient.tsx`
- Create: `src/components/modules/PlagiarismClient.tsx`
- Create: `src/components/modules/LiveRoomClient.tsx`
- Create: `src/lib/modules/inviteCodes.ts`
- Create: `src/lib/modules/plagiarismReport.ts`
- Create: `src/lib/modules/driveFiles.ts`

- [ ] **Step 1: Add module schema models and seed data**

Extend `prisma/schema.prisma` with these model groups:

- Invite codes: `InviteCode { code, kind, targetId, expiresAt, maxUses, usedCount }`
- Topics: `TopicFolder`, `Topic`, `TopicSection`, `TopicResource`
- Inbox: `Message { senderId, receiverId, subject, body, readAt, archivedAt, deletedBySenderAt, deletedByReceiverAt }`
- Groups: `Group`, `GroupMember`, `GroupPost`, `GroupComment`, `GroupFile`
- Notes: `Note`, `NoteTag`
- Drive: `DriveFile`, `DriveShare`
- Plagiarism: `PlagiarismCheck`
- Live: `LiveSession`, `LiveParticipant`, `LiveChatMessage`
- Support: `Announcement`, `HelpTicket`

Seed at least:

- One valid course invite code.
- One group with two posts and comments.
- Three inbox messages.
- Three notes with tags.
- A drive folder tree with files.
- One completed plagiarism report.
- One scheduled live session and one ended session.

- [ ] **Step 2: Implement invite-code route**

`POST /api/invite` accepts:

```ts
{
  code: string
}
```

Behavior:

- `COURSE` code enrolls current user in a course.
- `GROUP` code joins current user to a group.
- `DRIVE_SHARE` code creates access to a shared drive file.
- `LIVE_SESSION` code registers current user as live participant.
- Expired, over-used, and unknown codes return `400` with a Chinese error message.

- [ ] **Step 3: Implement topic module**

APIs:

- `GET /api/topics?folderId=&q=` lists folders and topics.
- `POST /api/topics` creates topic or folder.
- `PUT /api/topics/[topicId]` updates title, sections, resources, and publish state.
- `DELETE /api/topics/[topicId]` soft-deletes a topic or folder.

UI:

- `新建专题`, `新建文件夹`, `全部专题`, search.
- Topic editor supports title, rich plain-text sections, attached drive resources, publish/unpublish.
- Empty state remains `暂无内容` only when no records match.

- [ ] **Step 4: Implement inbox module**

APIs:

- `GET /api/inbox?box=inbox|sent|archived`
- `POST /api/inbox` sends a message by receiver ID.
- `PUT /api/inbox/[messageId]` marks read/unread or archives.
- `DELETE /api/inbox/[messageId]` deletes from the current user's mailbox view.

UI:

- Inbox/sent/archive tabs.
- Compose dialog with contact search.
- Message detail drawer.
- Unread badge in the nav if unread count is greater than zero.

- [ ] **Step 5: Implement group module**

APIs:

- `GET /api/groups` lists joined and discoverable groups.
- `POST /api/groups` creates a group.
- `PUT /api/groups/[groupId]` updates group name, description, and membership settings.
- `GET /api/groups/[groupId]` returns members, posts, files.
- `POST /api/groups/[groupId]/posts` creates a post or comment.

UI:

- Group list, create group, join by invite code.
- Group workspace with posts, comments, member list, and files.
- File upload uses the same local drive storage primitives.

- [ ] **Step 6: Implement notes module**

APIs:

- `GET /api/notes?q=&tag=&courseId=`
- `POST /api/notes`
- `PUT /api/notes/[noteId]`
- `DELETE /api/notes/[noteId]`

UI:

- Notes list, editor, tags, search.
- Course/lesson link selector.
- Autosave on explicit `保存`, not on every keystroke.

- [ ] **Step 7: Implement contacts module**

API:

- `GET /api/contacts?q=&role=&group=`

UI:

- Contact table grouped by institution and role.
- Profile side panel.
- `发消息` action opens inbox compose with receiver prefilled.

- [ ] **Step 8: Implement cloud drive module**

APIs:

- `GET /api/drive?parentId=`
- `POST /api/drive` creates folder or uploads file.
- `PUT /api/drive/[fileId]` renames or moves.
- `DELETE /api/drive/[fileId]` soft-deletes.
- `POST /api/drive/[fileId]/share` creates share code/link.

UI:

- Folder breadcrumb.
- Upload, new folder, rename, move, delete, share.
- Download action streams local file content.
- `添加到课程资料` attaches selected drive file to a course as `Resource`.

- [ ] **Step 9: Implement plagiarism module**

APIs:

- `GET /api/plagiarism` lists check history.
- `POST /api/plagiarism` uploads a document and creates a check job.
- `GET /api/plagiarism/[checkId]` returns status and report.

Local report algorithm:

- Extract document text with `extractText`.
- Compare against seeded sample corpus and user's previous uploads.
- Compute deterministic similarity score using normalized token overlap.
- Return matched passages, score, and risk level `低`, `中`, or `高`.

UI:

- Submit document.
- Status timeline.
- Report page with score, matched passages, and history.

- [ ] **Step 10: Implement personal live room module**

APIs:

- `GET /api/live` lists scheduled, live, and ended sessions.
- `POST /api/live` creates a session.
- `PUT /api/live/[sessionId]` starts, ends, or updates a session.
- `POST /api/live/[sessionId]/chat` sends chat message.

UI:

- Create/schedule live session.
- Teacher room with start/end controls, participant count, chat.
- Viewer room with join/leave, chat, and a local media/status panel.
- Session history with attendance and chat transcript.

- [ ] **Step 11: Verify module parity manually**

Manual checks:

- Enter an invite code and verify it changes membership or access.
- Create a topic, add a section, publish it, search for it.
- Send a message, mark it read, archive it, and delete it.
- Create a group, add a post, comment on it, and upload a file.
- Create a note with tags and link it to a course.
- Search contacts and start a message from a contact.
- Upload a drive file, rename it, share it, and attach it to a course.
- Submit a plagiarism check and open the generated report.
- Create a live session, start it, send chat, end it, and view history.

- [ ] **Step 12: Commit**

```bash
git add prisma src/app/api/invite src/app/api/topics src/app/api/inbox src/app/api/groups src/app/api/notes src/app/api/contacts src/app/api/drive src/app/api/plagiarism src/app/api/live src/app/space/topics src/app/space/inbox src/app/space/groups src/app/space/notes src/app/space/contacts src/app/space/drive src/app/space/plagiarism src/app/space/live src/components/modules src/lib/modules
git commit -m "feat: implement personal space functional modules"
```

## Task 10: Automated Tests

**Files:**
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/space.spec.ts`
- Create: `tests/e2e/ai-import.spec.ts`
- Create: `tests/e2e/modules.spec.ts`
- Modify: existing unit test files as needed.

- [ ] **Step 1: Configure Vitest and Playwright**

Vitest uses Node environment for server utilities.

Playwright starts `npm run dev` on port `3000`, reuses server locally, and records trace on failure.

- [ ] **Step 2: Add shell navigation E2E**

Test:

- Login as `李素艳`.
- Assert institution header.
- Navigate to `课程`.
- Assert `我学的课`, `我教的课`, `新建课程`.
- Navigate to `专题创作`.
- Assert `新建专题`, `新建文件夹`, topic search, and topic creation controls.

- [ ] **Step 3: Add AI import E2E**

Test:

- Login as `李素艳`.
- Open taught course.
- Click `AI 文档建课`.
- Upload generated markdown fixture.
- Wait for `等待确认`.
- Assert generated chapters appear.
- Apply outline.
- Assert course builder contains generated chapter.

- [ ] **Step 4: Add module parity E2E**

Test:

- Login as `李素艳`.
- Enter a seeded invite code and verify the resulting membership/access.
- Create and publish a topic.
- Send an inbox message to `学习者`, then mark it read and archived.
- Create a group post and comment.
- Create a note with a tag and a course link.
- Search contacts and open a profile.
- Upload a drive file, create a share code, and attach it to a course.
- Submit a plagiarism check and assert a completed report appears.
- Create a live session, start it, send a chat message, end it, and assert history appears.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

Expected:

- Unit tests pass.
- Typecheck passes.
- Production build succeeds.
- E2E tests pass.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts playwright.config.ts tests
git commit -m "test: cover functional parity flows"
```

## Task 11: Visual Polish and Close-to-Real Behavior

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/shell/*`
- Modify: `src/components/courses/*`
- Modify: `src/components/ai-import/*`

- [ ] **Step 1: Verify desktop layout**

Use viewport `1280x900`.

Required visual checks:

- Header height matches inspected 80px feel.
- Sidebar width and blue tone are close.
- Avatar block and active nav rows align.
- Course content starts below header and to the right of sidebar.
- Cards do not overlap at widths from 900px to 1440px.

- [ ] **Step 2: Verify mobile/tablet behavior**

Use widths `390`, `768`, `1024`.

Behavior:

- Sidebar collapses to icon rail or drawer.
- Header text truncates cleanly.
- Course cards wrap without horizontal overflow.
- AI review editor remains usable.

- [ ] **Step 3: Add loading and error states**

Add visible states for:

- Upload in progress.
- Import failed.
- No courses.
- No chapters.
- Permission denied.

- [ ] **Step 4: Run final checks**

Run:

```bash
npm run typecheck
npm run build
npm run test
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "polish: refine responsive product experience"
```

## Acceptance Criteria

- User can log in as teacher or student and see the Yimei-style personal space.
- UI shell preserves the inspected page structure and visual hierarchy, but exact visual matching is not required.
- Teacher can open `我教的课`, enter a course, and open `AI 文档建课`.
- Teacher can upload a supported document.
- System extracts text and generates a structured course directory.
- Teacher can review/edit generated chapters and lessons before applying.
- Applied outline appears in the course builder.
- Student view does not expose teacher-only import/apply controls.
- Invite-code entry works for local courses, groups, drive shares, and live sessions.
- Topic creation supports folders, sections, resources, publishing, search, and deletion.
- Inbox supports send, receive, read/unread, archive, delete, and message detail.
- Groups support create, join, posts, comments, members, and files.
- Notes support create, edit, delete, tags, search, and course/lesson links.
- Contacts support search, profile view, grouping, and starting a message.
- Cloud drive supports folders, upload, download, rename, move, delete, share, and attaching files to course resources.
- Plagiarism detection supports document submission, job status, history, and a deterministic local report.
- Personal live room supports scheduling, starting, ending, joining, chat, attendance, and history.
- App works without an OpenAI key by using deterministic fallback generation.
- All unit, typecheck, build, and E2E checks pass.

## Goal Execution Prompt

Use this prompt when creating the Codex goal:

```text
Execute docs/superpowers/plans/2026-05-25-yimei-ai-course-platform.md task by task. Do not skip tests. Use the required implementation sub-skill from the plan. Keep commits atomic. Prioritize functional parity over pixel-level UI matching: implement the observed Yimei-style shell, full local front-end/back-end behavior for every visible navigation module, and the AI document-to-course-directory workflow to the acceptance criteria.
```

## Self-Review

- Spec coverage: The plan covers the inspected Yimei shell, course tabs, teacher course workspace, AI upload/extraction/generation/review/apply workflow, permissions, persistence, and functional local equivalents for topics, inbox, groups, notes, contacts, drive, plagiarism, live room, invite codes, announcements, and help entries.
- Static-page scan: No navigation module is specified as static-only; each visible module has database models, API routes, UI behavior, and manual verification requirements.
- Type consistency: `GeneratedCourseOutline`, `CourseDirectoryNode`, module models, import job states, API paths, and role names are consistent across tasks.
