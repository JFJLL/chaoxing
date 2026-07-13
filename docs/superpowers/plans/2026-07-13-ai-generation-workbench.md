# AI Generation Workbench Implementation Plan

> **For Codex:** Follow the repository TDD and verification rules. Do not stage, commit, or push unless the user explicitly asks.

**Goal:** Replace every teacher-side AI generator with a real model-backed, retryable draft workflow, and make questions, papers, lesson plans, courseware, and HTML courseware safe to edit, version, confirm, and publish.

**Product rule:** An AI failure is an explicit failed state with a retry action. No local template, deterministic pseudo-generation, or silent fallback may produce a successful artifact.

**Architecture:** `CourseAiArtifact` is both the durable generation job and immutable revision record. A create request writes a `QUEUED` revision and the in-process queue advances it through `GENERATING` to `DRAFT` or `FAILED`. Editing creates a new revision in the same series. Question confirmation materializes stable `CourseQuestion` IDs; paper generation may reference only confirmed question IDs. HTML courseware is generated only from an approved courseware artifact, so visual regeneration cannot change teaching content.

**Tech stack:** Next.js 15 route handlers, React 19, Prisma 5, Zod, OpenAI-compatible model client, Vitest.

---

## Task 1: Strict model-backed generation contracts

**Files:**
- Modify: `src/lib/courseWorkspace/generateAiArtifact.ts`
- Modify: `src/types/courseWorkspace.ts`
- Create: `tests/unit/courseAiGeneration.test.ts`

1. Add failing tests for every app type: valid model JSON parses, empty/invalid output throws `MODEL_INVALID_OUTPUT`, missing config throws `MODEL_NOT_CONFIGURED`, and provider errors are sanitized.
2. Replace deterministic generators and HTML fallback with one strict async model-backed entry point.
3. Validate each payload with Zod and reject invented paper question IDs.
4. Run focused tests and typecheck.

## Task 2: Build permission-aware course context

**Files:**
- Create: `src/lib/courseWorkspace/buildAiContext.ts`
- Create: `tests/unit/courseAiContext.test.ts`
- Modify: `src/app/api/courses/[courseId]/ai-apps/route.ts`

1. Add tests for selected chapter scope, course outline, imported source text, published knowledge map, and course resource metadata.
2. Bound context size deterministically and preserve source labels for later citations.
3. Keep all queries behind `requireCourseOwner`; never accept arbitrary course/source IDs from the client.
4. Run focused tests and typecheck.

## Task 3: Add durable generation and question-bank data

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713000000_ai_generation_workbench/migration.sql`
- Create: `src/lib/courseWorkspace/artifactState.ts`
- Create: `tests/unit/courseAiArtifactState.test.ts`

1. Extend artifacts with series/revision lineage, nullable payload, failure code/message, selected scope, and timestamps.
2. Add `CourseQuestion` with stable IDs, approval status, source artifact/revision, payload fields, and course relation.
3. Add pure transition guards for `QUEUED -> GENERATING -> DRAFT|FAILED`, edit-to-new-revision, confirmation, archive, and publish.
4. Generate Prisma client; run focused tests and typecheck.

## Task 4: Implement recoverable AI generation queue

**Files:**
- Create: `src/lib/courseWorkspace/aiGenerationQueue.ts`
- Create: `src/lib/courseWorkspace/runAiGenerationJob.ts`
- Create: `tests/unit/courseAiGenerationQueue.test.ts`
- Modify: `src/app/api/courses/[courseId]/ai-apps/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/retry/route.ts`

1. Test duplicate enqueue protection, bounded workers, stale job recovery, safe failure persistence, retry, and owner scoping.
2. POST creates `QUEUED` and returns 202 immediately; GET returns status and safe error protocol.
3. Retry reuses the exact artifact input and creates no local content.
4. Add runtime response validation and terminal polling semantics.

## Task 5: Add draft editing, revision history, and confirmation

**Files:**
- Modify: `src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/route.ts`
- Create: `src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/confirm/route.ts`
- Modify: `src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/publish/route.ts`
- Create: `tests/unit/courseAiRevision.test.ts`

1. PUT validates the app-specific payload and creates a new DRAFT revision instead of mutating history.
2. Confirming question generation upserts stable `CourseQuestion` rows; other artifacts become `APPROVED`.
3. Publishing requires approved state and archives the previous published revision in the same series.
4. Paper approval verifies every referenced question belongs to the course and is approved.

## Task 6: Rebuild the teacher workbench UI

**Files:**
- Modify: `src/components/course-workspace/AiAppGenerator.tsx`
- Create: `src/components/course-workspace/AiArtifactEditor.tsx`
- Create: `src/lib/courseWorkspace/aiArtifactClient.ts`
- Create: `tests/unit/courseAiArtifactClient.test.ts`

1. Show durable states: queued, generating spinner, draft, failed with explicit retry, approved, published.
2. Poll serially, validate 200 responses at runtime, survive transient poll errors, and stop on terminal states.
3. Add editable JSON-backed forms for each artifact type, save-as-new-version, confirm, and publish actions.
4. On AI failure show only the safe error and `重试`; do not expose any template action.

## Task 7: Enforce question-bank paper assembly and courseware-to-HTML lineage

**Files:**
- Modify: `src/lib/courseWorkspace/generateAiArtifact.ts`
- Modify: `src/app/api/courses/[courseId]/ai-apps/route.ts`
- Modify: `src/components/course-workspace/AiAppGenerator.tsx`
- Modify: `src/app/api/courses/[courseId]/html-courseware/route.ts`
- Create: `tests/unit/courseAiLineage.test.ts`

1. Paper generation receives only approved course questions; insufficient questions returns a domain error telling the teacher to generate/review questions.
2. HTML generation requires an approved courseware artifact and passes its exact slide content as immutable source.
3. Verify HTML sanitization and prohibit visual output from changing slide text.

## Task 8: Full regression and adversarial review

1. Scan `src` for local generator/fallback/template success paths.
2. Run focused tests, full tests, typecheck, Prisma validation, production build, and `git diff --check`.
3. Adversarially review authorization, cross-course IDs, prompt/context leakage, malformed model output, retry races, duplicate jobs, revision overwrite, paper referential integrity, HTML injection, and publication visibility.
4. Fix every Critical/Important finding and rerun the covering checks.
