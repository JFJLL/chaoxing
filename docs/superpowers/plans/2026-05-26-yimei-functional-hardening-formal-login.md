# Yimei Functional Hardening And Formal Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current Yimei-style MVP into a safer functionally equivalent system by replacing local role-pick login with formal credential login, fixing authorization gaps, deepening visible modules, and proving flows through UI-level tests.

**Architecture:** Keep the current Next.js App Router + Prisma + SQLite architecture, but introduce production-shaped auth, central permission helpers, module-specific service helpers, and UI-first end-to-end tests. This plan builds on the existing project at `D:\download\pic-vec\yimei` and should not restart from scratch.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, SQLite, bcryptjs, Zod, React, Playwright, Vitest, existing OpenAI-compatible AI import pipeline.

---

## Current State Summary

Already present:

- Next.js/Prisma app builds successfully.
- Course shell, AI document import, and all visible sidebar routes exist.
- Unit tests and E2E tests pass after a clean dev-server start.

Known gaps to fix:

- Login is still a local account picker instead of formal credential login.
- `SESSION_SECRET` silently falls back to `local-dev-secret`.
- Drive file download can expose another user's file by ID.
- Group read/update/post routes do not enforce membership/owner permissions.
- Course access is too broad for active courses in the same institution.
- Several buttons are visual only: add course, course folder, publish course, course folders.
- Secondary modules are still shallow compared with functional parity requirements.
- E2E tests mostly call APIs with `fetch`; they do not prove real UI workflows.
- Dev server showed `.next` stale chunk errors after test/build churn; clean-start validation is needed.

## Target Acceptance Criteria

- Formal login page accepts email/password credentials and no longer exposes one-click user selection.
- Seeded accounts have password hashes and documented dev credentials.
- Session cookies require an explicit `SESSION_SECRET`; startup fails in non-test/non-development fallback scenarios.
- Course access requires owner, enrollment, admin, or explicit invite/share permission.
- Teacher-only course actions require course ownership/admin.
- Drive file read/download/share/move/delete/attach requires owner or valid share access.
- Group detail/update/post/comment/file actions require correct membership or owner role.
- Topic, inbox, notes, contacts, drive, plagiarism, and live modules support UI-level functional flows, not only API routes.
- All previously identified visual-only buttons either work or are removed from the UI.
- UI-level Playwright tests exercise forms and buttons for the core flows.
- `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e` pass from a clean `.next` state.

## File Map

- Modify: `prisma/schema.prisma` - add auth fields and access models.
- Modify: `prisma/seed.ts` - seed hashed passwords and permission data.
- Modify: `src/lib/auth.ts` - credential session hardening.
- Create: `src/lib/passwords.ts` - password hashing and verification helpers.
- Create: `src/lib/validation/auth.ts` - login schema.
- Modify: `src/app/login/page.tsx` - formal login UI.
- Modify: `src/app/api/auth/login/route.ts` - email/password login.
- Modify: `src/components/shell/UserMenu.tsx` - remove dev assumptions and keep logout.
- Modify: `src/lib/permissions.ts` - central course/module permission helpers.
- Create: `src/lib/modules/groupPermissions.ts` - group authorization helpers.
- Create: `src/lib/modules/drivePermissions.ts` - drive authorization helpers.
- Modify: `src/app/api/courses/**` - access and publish/folder actions.
- Modify: `src/app/api/drive/**` - enforce file access and add missing operations.
- Modify: `src/app/api/groups/**` - enforce membership and owner permissions.
- Modify: `src/app/api/topics/**` - search, folder navigation, section/resource editing.
- Modify: `src/app/api/inbox/**` - tabs, receiver prefill, read/archive/delete.
- Modify: `src/app/api/live/**` - host/viewer permissions and history.
- Modify: `src/components/modules/*` - replace shallow controls with complete UI workflows.
- Modify: `tests/e2e/*.spec.ts` - convert API-heavy tests to UI-level tests.
- Create: `tests/unit/permissions.test.ts` - authorization unit tests.
- Create: `tests/unit/auth.test.ts` - password/session unit tests.
- Create: `tests/e2e/auth.spec.ts` - formal login/logout tests.

## Task 1: Formal Credential Login

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `src/lib/passwords.ts`
- Create: `src/lib/validation/auth.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/lib/auth.ts`
- Create: `tests/unit/auth.test.ts`
- Create: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Add auth fields**

Modify `User` in `prisma/schema.prisma`:

```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String?
  avatar        String?
  role          String
  institutionId String
  // keep existing relations unchanged
}
```

Run:

```bash
npm run db:migrate -- --name formal_login
npm run db:generate
```

Expected: migration succeeds and Prisma client regenerates.

- [ ] **Step 2: Implement password helpers**

Create `src/lib/passwords.ts`:

```ts
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}
```

- [ ] **Step 3: Add login validation**

Create `src/lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("请输入有效邮箱"),
  password: z.string().min(6, "密码至少 6 位")
});
```

- [ ] **Step 4: Seed real dev credentials**

Update `prisma/seed.ts` to hash passwords:

```ts
import { hashPassword } from "../src/lib/passwords";

const teacherPassword = await hashPassword("Teacher@2026");
const studentPassword = await hashPassword("Student@2026");
```

Seed:

- `li.suyan@example.local` / `Teacher@2026`
- `wang.yifan@example.local` / `Teacher@2026`
- `student@example.local` / `Student@2026`

Do not store plain passwords in the database. Print the dev credentials at the end of seed output.

- [ ] **Step 5: Replace one-click login route**

Modify `src/app/api/auth/login/route.ts`:

- Accept `email` and `password`, not `userId`.
- Validate with `loginSchema`.
- Find user by email.
- Verify password with `verifyPassword`.
- Return `401` for invalid credentials using a generic message `邮箱或密码错误`.
- Set the same signed session cookie on success.

- [ ] **Step 6: Harden session secret behavior**

Modify `src/lib/auth.ts`:

```ts
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }
  return secret;
}
```

Set cookie options:

```ts
secure: process.env.NODE_ENV === "production",
sameSite: "lax",
httpOnly: true
```

- [ ] **Step 7: Replace login page UI**

Modify `src/app/login/page.tsx` to render:

- Email input.
- Password input.
- Submit button `登录`.
- Dev credential hint only in `NODE_ENV !== "production"`.
- Error display for invalid credentials.

The page must not render selectable user cards.

- [ ] **Step 8: Add tests**

Add `tests/unit/auth.test.ts`:

- Hash/verify accepts correct password.
- Verify rejects wrong password.
- Login schema rejects invalid email and short password.

Add `tests/e2e/auth.spec.ts`:

- Visiting `/login` shows email/password fields.
- Login with wrong password stays on `/login` and shows error.
- Login with `li.suyan@example.local` / `Teacher@2026` redirects to `/space`.
- Logout returns to `/login`.

- [ ] **Step 9: Verify and commit**

Run:

```bash
npm run db:seed
npm run test -- tests/unit/auth.test.ts
npm run test:e2e -- tests/e2e/auth.spec.ts
npm run typecheck
```

Expected: all pass.

Commit:

```bash
git add prisma src/lib/passwords.ts src/lib/validation/auth.ts src/lib/auth.ts src/app/login src/app/api/auth tests/unit/auth.test.ts tests/e2e/auth.spec.ts
git commit -m "feat: replace dev picker with credential login"
```

## Task 2: Central Authorization Fixes

**Files:**
- Modify: `src/lib/permissions.ts`
- Create: `src/lib/modules/drivePermissions.ts`
- Create: `src/lib/modules/groupPermissions.ts`
- Modify: `src/app/api/courses/**`
- Modify: `src/app/api/drive/**`
- Modify: `src/app/api/groups/**`
- Modify: `src/app/api/live/**`
- Create: `tests/unit/permissions.test.ts`

- [ ] **Step 1: Tighten course access**

Modify `requireCourseAccess` in `src/lib/permissions.ts` so access is allowed only when:

- user is admin, or
- user owns the course, or
- user has `CourseEnrollment`.

Remove the broad condition:

```ts
{ institutionId: user.institutionId, status: "ACTIVE" }
```

Add `requireCourseEnrollmentOrOwner(user, courseId)` and `requireAdminOrOwner(user, ownerId)`.

- [ ] **Step 2: Add drive permission helpers**

Create `src/lib/modules/drivePermissions.ts`:

```ts
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export async function requireDriveFileReadable(user: SessionUser, fileId: string) {
  const file = await db.driveFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      OR: [
        { ownerId: user.id },
        { shares: { some: { expiresAt: null } } }
      ]
    }
  });
  if (!file) throw new Error("无权访问文件");
  return file;
}

export async function requireDriveFileOwner(user: SessionUser, fileId: string) {
  const file = await db.driveFile.findFirst({ where: { id: fileId, ownerId: user.id, deletedAt: null } });
  if (!file) throw new Error("无权管理文件");
  return file;
}
```

Then refine share rules to check share expiration and invite-code redemption in implementation.

- [ ] **Step 3: Add group permission helpers**

Create `src/lib/modules/groupPermissions.ts`:

```ts
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export async function requireGroupMember(user: SessionUser, groupId: string) {
  const member = await db.groupMember.findFirst({ where: { groupId, userId: user.id } });
  if (!member && user.role !== "ADMIN") throw new Error("无权访问小组");
  return member;
}

export async function requireGroupOwner(user: SessionUser, groupId: string) {
  const member = await db.groupMember.findFirst({ where: { groupId, userId: user.id, role: "owner" } });
  if (!member && user.role !== "ADMIN") throw new Error("无权管理小组");
  return member;
}
```

- [ ] **Step 4: Apply helpers to APIs**

Update:

- `src/app/api/drive/[fileId]/route.ts`: `GET` must call `requireDriveFileReadable`, `PUT/DELETE` must call `requireDriveFileOwner`.
- `src/app/api/drive/[fileId]/share/route.ts`: only owner can create share.
- `src/app/api/drive/route.ts`: attaching drive file to a course requires readable file and course owner permission.
- `src/app/api/groups/[groupId]/route.ts`: `GET` requires membership unless group is open; `PUT` requires owner.
- `src/app/api/groups/[groupId]/posts/route.ts`: creating post/comment requires membership.
- `src/app/api/live/[sessionId]/chat/route.ts`: chat requires host or participant.
- `src/app/api/live/[sessionId]/route.ts`: start/end requires host; join/leave applies to current user.

- [ ] **Step 5: Add authorization tests**

Create `tests/unit/permissions.test.ts` covering:

- Non-enrolled student cannot access another active course.
- Enrolled student can access course.
- Non-owner cannot download another private drive file.
- File owner can download and share.
- Non-member cannot post in closed group.
- Group owner can update group.
- Live non-participant cannot chat.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test -- tests/unit/permissions.test.ts
npm run typecheck
npm run test:e2e
```

Commit:

```bash
git add src/lib/permissions.ts src/lib/modules/drivePermissions.ts src/lib/modules/groupPermissions.ts src/app/api tests/unit/permissions.test.ts
git commit -m "fix: enforce module authorization"
```

## Task 3: Complete Course Actions

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/courses/route.ts`
- Create: `src/app/api/courses/[courseId]/publish/route.ts`
- Create: `src/app/api/course-folders/route.ts`
- Modify: `src/app/space/courses/page.tsx`
- Modify: `src/components/courses/NewCourseDialog.tsx`
- Create: `src/components/courses/CourseFolderDialog.tsx`
- Modify: `src/app/space/courses/[courseId]/page.tsx`
- Modify: `tests/e2e/space.spec.ts`

- [ ] **Step 1: Add course folders**

Add Prisma model:

```prisma
model CourseFolder {
  id        String   @id @default(cuid())
  title     String
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Add optional `folderId` to `Course`.

- [ ] **Step 2: Implement add-course by invite**

Make student-side `添加课程` open a dialog with invite-code entry. Submitting calls `/api/invite` and refreshes the learned-course list.

- [ ] **Step 3: Implement course folder creation**

Create `/api/course-folders`:

- `GET` lists current user's folders.
- `POST` creates a folder.
- Validate title is at least 2 characters.

Hook `新建文件夹` in `src/app/space/courses/page.tsx` to real creation.

- [ ] **Step 4: Implement publish/unpublish**

Create `/api/courses/[courseId]/publish`:

```ts
POST body: { status: "ACTIVE" | "DRAFT" | "ARCHIVED" }
```

Only course owner/admin can update. Wire the course overview button to call it and refresh status.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run db:migrate -- --name course_actions
npm run db:seed
npm run test:e2e -- tests/e2e/space.spec.ts
npm run typecheck
```

Commit:

```bash
git add prisma src/app/api/courses src/app/api/course-folders src/app/space/courses src/components/courses tests/e2e/space.spec.ts
git commit -m "feat: complete course list actions"
```

## Task 4: Deepen Secondary Module UI Workflows

**Files:**
- Modify: `src/components/modules/TopicManager.tsx`
- Modify: `src/components/modules/InboxClient.tsx`
- Modify: `src/components/modules/GroupWorkspace.tsx`
- Modify: `src/components/modules/NotesClient.tsx`
- Modify: `src/components/modules/ContactsDirectory.tsx`
- Modify: `src/components/modules/DriveClient.tsx`
- Modify: `src/components/modules/PlagiarismClient.tsx`
- Modify: `src/components/modules/LiveRoomClient.tsx`
- Modify: `src/app/api/topics/**`
- Modify: `src/app/api/inbox/**`
- Modify: `src/app/api/notes/**`
- Modify: `src/app/api/drive/**`
- Modify: `src/app/api/plagiarism/**`
- Modify: `src/app/api/live/**`

- [ ] **Step 1: Topics**

Implement in UI and API:

- Search box using `q`.
- Folder navigation using `folderId`.
- Edit topic title/description.
- Edit sections with add/remove.
- Attach drive resources.
- Delete topic/folder.

- [ ] **Step 2: Inbox**

Implement:

- Inbox/sent/archive tabs.
- Receiver prefill from `/space/inbox?receiverId=...`.
- Message detail drawer.
- Read/unread toggle.
- Archive and delete visibility per current user.

- [ ] **Step 3: Groups**

Implement:

- Joined/open group tabs.
- Join group by invite code.
- Group detail view.
- Comments from UI, not only API.
- Group file upload.
- Owner-only group settings.

- [ ] **Step 4: Notes**

Implement:

- Search and tag filter.
- Edit existing note.
- Delete note.
- Link note to course and lesson.
- Persist tags on update.

- [ ] **Step 5: Contacts**

Implement:

- Search and role filter.
- Grouped view by role/institution.
- Profile panel.
- `发消息` opens compose with receiver prefilled and sends successfully.

- [ ] **Step 6: Drive**

Implement:

- Folder breadcrumb and folder opening.
- Rename.
- Move.
- Delete.
- Share code display.
- Course selector for attaching to course resources.
- Download permission check.

- [ ] **Step 7: Plagiarism**

Implement:

- Submit document from UI.
- Status/result card.
- Report detail view with matched passages.
- History list.
- Error display when extraction fails.

- [ ] **Step 8: Live room**

Implement:

- Schedule date/time field.
- Host-only start/end controls.
- Viewer join/leave controls.
- Chat transcript.
- Attendance/history panel.

- [ ] **Step 9: Verify and commit**

Run:

```bash
npm run typecheck
npm run build
```

Manually verify each sidebar module through UI. Then commit:

```bash
git add src/components/modules src/app/api src/app/space
git commit -m "feat: deepen personal space module workflows"
```

## Task 5: Replace API-Only E2E With UI-Level E2E

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/space.spec.ts`
- Modify: `tests/e2e/ai-import.spec.ts`
- Modify: `tests/e2e/modules.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Update helpers for formal login**

Change `loginAs` to use email/password:

```ts
export async function loginAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("li.suyan@example.local");
  await page.getByLabel("密码").fill("Teacher@2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/space/);
}
```

Add `loginAsStudent`.

- [ ] **Step 2: Convert modules.spec to UI actions**

The test must click and fill UI controls:

- Navigate through sidebar links.
- Create topic through form and assert card appears.
- Compose inbox message through form.
- Create group post/comment through UI.
- Create note through UI and assert tag appears.
- Search contact and click `发消息`.
- Upload drive file through UI, share it, attach it to selected course.
- Upload plagiarism file through UI and open report.
- Create/start/join/chat/end live session through UI.

Do not use direct `fetch` for the primary assertions.

- [ ] **Step 3: Add negative permission E2E**

Add tests:

- Student cannot see teacher-only AI import button on a non-owned course.
- Student cannot open teacher course builder.
- Student cannot update another user's group settings.
- Student cannot download private teacher drive file by URL.

- [ ] **Step 4: Stabilize Playwright server**

Modify `playwright.config.ts`:

- Use a pre-test setup script that removes `.next`.
- Use a non-default port such as `3100` to avoid stale local servers.
- Set `reuseExistingServer: false` in CI-like local validation.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:e2e
```

Expected: all E2E tests pass with UI-level workflows.

Commit:

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: verify functional parity through UI flows"
```

## Task 6: Clean Runtime Stability And Final Verification

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `docs/superpowers/plans/2026-05-26-yimei-functional-hardening-formal-login.md`

- [ ] **Step 1: Add clean scripts**

Add scripts:

```json
{
  "clean": "rimraf .next test-results playwright-report",
  "verify": "npm run clean && npm run typecheck && npm run test && npm run build && npm run test:e2e"
}
```

If `rimraf` is not installed, add it as a dev dependency or implement a cross-platform Node cleanup script.

- [ ] **Step 2: Update gitignore**

Ensure these remain ignored:

```gitignore
.next
test-results
playwright-report
.uploads
prisma/dev.db
```

- [ ] **Step 3: Run clean final verification**

Run:

```bash
npm run verify
```

Expected:

- Clean build starts from no stale `.next`.
- Typecheck passes.
- Unit tests pass.
- Production build passes.
- UI-level E2E passes.
- No `Cannot find module './*.js'` stale chunk errors in dev-server output.

- [ ] **Step 4: Write final audit note**

Create `docs/verification/2026-05-26-functional-hardening.md` with:

- commands run,
- pass/fail results,
- remaining known limitations,
- seeded login credentials,
- screenshots or Playwright trace location if available.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore docs/verification
git commit -m "chore: add clean verification workflow"
```

## Goal Execution Prompt

Use this prompt in the new Codex goal session:

```text
Create and execute a Codex goal to complete D:\download\pic-vec\yimei\docs\superpowers\plans\2026-05-26-yimei-functional-hardening-formal-login.md.

Do not restart the project. Build on the existing implementation. Prioritize formal credential login, authorization correctness, real UI workflows, and clean verification. Run each task's tests before moving on. Fix regressions immediately. Unless truly blocked, continue until all acceptance criteria pass and npm run verify succeeds. Follow AGENTS.md and RTK.md strictly.
```

## Self-Review

- Spec coverage: This plan directly addresses the prior audit findings: formal login, session hardening, course access, drive access, group permissions, visual-only course actions, shallow module workflows, UI-level E2E, and clean runtime verification.
- Static-page scan: Every module listed here has concrete API/UI/test work, not a static-only page requirement.
- Type consistency: File paths, helper names, auth fields, and test names are consistent across tasks.
