# Interactive AI Assistants Implementation Plan

> Execution note: follow the repository rules, use TDD for each task, do not stage or commit without explicit user authorization, and run an adversarial review before declaring completion.

**Goal:** Replace the remaining display-only AI tutor, current-course search, and AI coach surfaces with permission-aware, persistent, real-model workflows that fail explicitly and can be retried.

**Architecture:** Build one permission-filtered course knowledge source service shared by search and tutor. Search asks the configured model to select only server-provided source IDs and returns verbatim snippets with course-local links. Tutor and coach use a shared streaming model client; user messages are persisted before generation, assistant messages only after a complete stream, so failed or stopped responses never become official history. Coach tasks and attempts are stored separately so teacher-owned rubrics cannot be changed by students.

**Tech Stack:** Next.js App Router, React 19, Prisma/SQLite, Zod, OpenAI-compatible or Gemini model APIs, Vitest/Testing Library.

---

## Task 1: Persistent interaction model and permission-filtered knowledge sources

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713004000_ai_interactive_workflows/migration.sql`
- Create: `src/lib/courseWorkspace/courseKnowledgeSources.ts`
- Create: `tests/unit/courseKnowledgeSources.test.ts`

1. Add failing tests proving teachers can retrieve private imports, question answers, and all AI artifacts while students receive only active course structure, resources, announcements, and published AI artifacts.
2. Add `CourseAiConversation`, `CourseAiMessage`, and `AiCoachTask` models with course/user ownership, coach-task lineage, statuses, evaluation storage, cascade behavior, and lookup indexes.
3. Build bounded source chunks with stable IDs, verbatim snippets, source types, labels, and course-local links. Never trust client-provided course content or citations.
4. Add SQLite triggers that prevent cross-course coach-task/conversation relationships.
5. Run focused tests, Prisma validation/generation, and apply the migration to the local development database.

## Task 2: Real current-course intelligent search

**Files:**
- Create: `src/lib/courseWorkspace/searchCourseKnowledge.ts`
- Create: `src/app/api/courses/[courseId]/ai-search/route.ts`
- Create: `src/components/course-workspace/AiCourseSearch.tsx`
- Modify: `src/components/course-workspace/AiWorkbench.tsx`
- Create: `tests/unit/courseAiSearch.test.ts`
- Create: `tests/unit/aiCourseSearch.test.tsx`

1. Add failing tests for access control, bounded input, model-not-configured, provider failure, invalid model output, unknown source IDs, explicit no-results, and student/private-source isolation.
2. Ask the configured model to rank only provided source IDs. Validate strict JSON and map IDs back to server-owned verbatim snippets; never display model-invented excerpts or URLs.
3. Implement the top-bar search with loading state, disabled duplicate submission, results with source type and clickable link, explicit empty state, sanitized failure message, and retry preserving the query.
4. Run focused route/service/component tests.

## Task 3: Streaming AI tutor with durable history

**Files:**
- Modify: `src/lib/ai/modelClient.ts`
- Create: `src/lib/courseWorkspace/aiConversation.ts`
- Create: `src/app/api/courses/[courseId]/ai-tutor/conversations/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-tutor/conversations/[conversationId]/messages/route.ts`
- Create: `src/components/course-workspace/AiTutor.tsx`
- Modify: `src/components/course-workspace/AiWorkbench.tsx`
- Modify: `src/app/space/courses/[courseId]/ai-workbench/page.tsx`
- Create: `tests/unit/aiModelStream.test.ts`
- Create: `tests/unit/aiTutorRoute.test.ts`
- Create: `tests/unit/aiTutor.test.tsx`

1. Add a provider-neutral text-stream API for OpenAI-compatible and Gemini providers with abort propagation and sanitized stable failures.
2. Create/list tutor conversations only for accessible course users. Re-check ownership on every message request.
3. Retrieve permission-filtered sources on the server and stream an answer that cites numbered, server-provided sources. Persist the user message once; persist the assistant response only after successful completion.
4. Implement loading/streaming, stop, retry-without-duplicating-the-user-message, retained history/input after failure, citations, and explicit failure UI. Do not offer any template response.
5. Run focused service/route/component tests.

## Task 4: Teacher-authored AI coach and evaluated student attempts

**Files:**
- Create: `src/lib/courseWorkspace/aiCoach.ts`
- Create: `src/app/api/courses/[courseId]/ai-coach/tasks/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-coach/tasks/[taskId]/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-coach/attempts/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-coach/attempts/[attemptId]/messages/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-coach/attempts/[attemptId]/evaluate/route.ts`
- Create: `src/components/course-workspace/AiCoach.tsx`
- Modify: `src/app/space/courses/[courseId]/ai-coach/page.tsx`
- Create: `tests/unit/aiCoachRoute.test.ts`
- Create: `tests/unit/aiCoach.test.tsx`

1. Add failing tests for teacher-only task creation/edit/publication, student visibility of published tasks only, immutable teacher rubric during attempts, same-course lineage, attempt ownership, complete assistant-message persistence, and strict evaluation output.
2. Implement task configuration for scenario, AI role, objective, rubric dimensions, and completion criteria. Students never submit or override these fields when starting an attempt.
3. Reuse the streaming conversation protocol for real multi-turn role play. Persist complete messages only and expose retry on failure.
4. Evaluate the complete transcript with the configured model using a strict schema containing per-dimension scores, evidence excerpts that must occur in the transcript, and improvement advice. Failed evaluation remains retryable and stores no partial official result.
5. Build teacher task management/attempt review and student practice/evaluation UI using real data only.
6. Run focused route/service/component tests.

## Task 5: Full verification and adversarial review

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/phase3-adversarial-review.md`

1. Run all tests, TypeScript checks, Prisma validation/migration status, production build, and `git diff --check`.
2. Scan for AI fallbacks, template/mock labels, unchecked client IDs, secrets in responses, unbounded prompts, missing ownership filters, and partial-message persistence.
3. Adversarially test cross-course IDs, student access to drafts/answers, retry duplication, abort races, malformed provider streams, hallucinated citations, rubric tampering, and evaluation evidence forgery.
4. Fix all Critical/Important findings and repeat the full suite before reporting completion.
