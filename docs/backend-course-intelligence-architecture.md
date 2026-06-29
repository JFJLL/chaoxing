# Course Intelligence Backend Architecture

## Goal

Build the first backend version for course document upload, parsing, knowledge-map generation, playable HTML courseware, and AI-app completion.

The product boundary is a shared teaching platform with role-based experiences:

- Teachers manage courses, upload course documents, run parsing/generation jobs, review drafts, and publish results.
- Students join courses, view only published learning content, play published HTML courseware, and track progress.

## Confirmed Scope

In scope for the first backend version:

- Course material upload for teacher-owned courses.
- Document parsing for PDF, DOCX, PPTX, Markdown, and plain text.
- Async heavy-job queue for parsing and AI generation.
- Course knowledge map as the first version of "knowledge graph".
- Playable HTML courseware generated from reviewed course knowledge.
- Teacher review before applying generated content to course structure.
- Independent publishing for course structure, knowledge map, and AI artifacts.
- Student access only to `PUBLISHED` content.
- Production design for 100-200 concurrent users, where heavy jobs wait in queue and normal browsing continues.

Out of scope for the first version:

- Video parsing.
- Batch parsing of student homework.
- Full graph inference, entity disambiguation, or graph database migration.
- Complex online slide editor.
- Queuing normal page visits.

## Current Project Baseline

The current project already has the foundations:

- Auth roles: `STUDENT`, `TEACHER`, `ADMIN`.
- Course ownership and enrollment.
- Teacher-only course management helpers such as `requireCourseOwner`.
- `DocumentImportJob` for document import status.
- Document extraction through `src/lib/document/extractText.ts`.
- AI outline generation through `src/lib/ai/generateCourseOutline.ts`.
- AI artifacts through `CourseAiArtifact`.
- AI apps for question generation, lesson plan, courseware, and paper assembly.

Current gaps:

- Course upload parsing runs synchronously in the request path.
- `CourseAiArtifact` has no publish/status/version fields.
- Knowledge map has no dedicated node/edge data model.
- Student/teacher UI is partially shared and needs role-specific entry behavior.
- SQLite is acceptable for local development but not for 100-200 user production concurrency.
- AI config names are OpenAI-oriented even when the provider is Gemini-compatible.

## Roles And Permissions

Role rules:

| Capability | Teacher owner | Admin | Enrolled student |
| --- | --- | --- | --- |
| Create course | Yes | Yes | No |
| Join course | Optional | Optional | Yes |
| Upload course document | Yes | Yes | No |
| View import job status | Yes | Yes | No |
| Retry/delete import job | Yes | Yes | No |
| Review generated draft | Yes | Yes | No |
| Publish course structure | Yes | Yes | No |
| Publish knowledge map | Yes | Yes | No |
| Publish HTML courseware | Yes | Yes | No |
| View published course content | Yes | Yes | Yes |
| View drafts/prompts/logs/errors | Yes | Yes | No |

Backend rule: never rely only on hidden UI. Teacher-only APIs must call `requireCourseOwner` or a stricter helper. Student-readable APIs must filter by `status = "PUBLISHED"` and course enrollment.

## Data Model Plan

### Existing Models To Extend

`DocumentImportJob` should become the lifecycle record for course upload and generation:

```prisma
model DocumentImportJob {
  id               String   @id @default(cuid())
  courseId         String
  userId           String
  status           String   @default("QUEUED")
  originalName     String
  filePath         String?
  mimeType         String?
  extractedText    String?
  generatedOutline String?
  warning          String?
  errorMessage     String?
  currentStage     String?
  queuePosition    Int?
  retryCount       Int      @default(0)
  startedAt        DateTime?
  finishedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

`CourseAiArtifact` should support generated HTML and publication:

```prisma
model CourseAiArtifact {
  id          String   @id @default(cuid())
  courseId    String
  userId      String
  appType     String
  title       String
  prompt      String?
  payload     String
  status      String   @default("DRAFT")
  version     Int      @default(1)
  sourceJobId String?
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Required `appType` values:

- `question_generation`
- `lesson_plan`
- `courseware`
- `paper_assembly`
- `html_courseware`

### New Knowledge Map Models

Use relational node/edge tables first. This keeps Prisma/PostgreSQL simple while preserving graph upgrade paths.

```prisma
model CourseKnowledgeMap {
  id          String   @id @default(cuid())
  courseId    String
  sourceJobId String?
  title       String
  summary     String?
  status      String   @default("DRAFT")
  version     Int      @default(1)
  publishedAt DateTime?
  nodes       KnowledgeNode[]
  edges       KnowledgeEdge[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model KnowledgeNode {
  id        String   @id @default(cuid())
  mapId     String
  map       CourseKnowledgeMap @relation(fields: [mapId], references: [id], onDelete: Cascade)
  label     String
  type      String
  summary   String?
  order     Int      @default(0)
  metadata  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model KnowledgeEdge {
  id        String   @id @default(cuid())
  mapId     String
  map       CourseKnowledgeMap @relation(fields: [mapId], references: [id], onDelete: Cascade)
  sourceId  String
  targetId  String
  type      String
  label     String?
  weight    Float?
  metadata  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Suggested node types:

- `chapter`
- `lesson`
- `concept`
- `skill`
- `case`
- `assessment`

Suggested edge types:

- `contains`
- `prerequisite`
- `related`
- `applies_to`
- `assesses`

## Job Status Machine

Use these statuses for teacher-facing task tracking:

| Status | Meaning |
| --- | --- |
| `QUEUED` | Waiting for worker capacity |
| `EXTRACTING` | Extracting text from uploaded file |
| `STRUCTURING` | Generating course structure draft |
| `MAPPING` | Generating knowledge map |
| `COURSEWARE_GENERATING` | Generating playable HTML courseware |
| `READY_FOR_REVIEW` | Teacher can review draft outputs |
| `PUBLISHED` | Reviewed output has been published |
| `FAILED` | Job failed and can be retried |

Important behavior:

- Upload API returns a job id immediately.
- Worker updates status and stage.
- UI polls job detail/list endpoints.
- Retry creates a new attempt or resets the same job with incremented `retryCount`.
- Failed jobs must preserve `errorMessage`.

## Queue And Concurrency

Production target:

- 100-200 concurrent users.
- Normal browsing, reading, and playing published HTML should not queue.
- Heavy tasks must queue.

Recommended production stack:

- PostgreSQL for application data.
- Redis + BullMQ for heavy jobs.
- Configurable worker concurrency:
  - `MAX_IMPORT_WORKERS=2`
  - `MAX_AI_WORKERS=3`
  - `MAX_FILE_SIZE_MB=50`
- File storage abstraction:
  - local `.uploads/` in development.
  - object storage-compatible adapter in production.

Heavy jobs:

- document extraction
- outline generation
- knowledge map generation
- playable HTML courseware generation
- AI app generation

Do not queue:

- course list
- course detail
- published knowledge map read
- published HTML playback
- student progress read/write, unless later proven necessary

## AI Provider Configuration

The current code uses the OpenAI SDK and these variables:

```env
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
```

The backend supports two AI provider modes:

- `openai-compatible`: OpenAI SDK with a compatible `chat.completions` endpoint.
- `gemini`: Google Gemini native `generateContent` endpoint.

Preferred neutral configuration:

```env
AI_PROVIDER="gemini"
AI_API_KEY=""
AI_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
AI_MODEL="gemini-2.5-flash"

OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL=""
```

Resolution order:

1. `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
2. fallback to `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
3. fallback to lowercase `apiKey`, `baseUrl`, `model` for existing local Gemini configuration
4. fallback to deterministic local generator when no key is configured or AI call fails

Provider detection:

- `AI_PROVIDER=gemini`, `AI_PROVIDER=google`, or `AI_PROVIDER=gemini-native` uses Gemini native mode.
- A base URL containing `generativelanguage` or `googleapis` also uses Gemini native mode.
- Everything else defaults to OpenAI-compatible mode.

Implementation note: keep the existing fallback behavior. AI failure should degrade to a useful draft, not block the whole upload flow.

## Backend API Plan

### Teacher Import APIs

`POST /api/courses/[courseId]/imports`

- Requires course owner/admin.
- Accepts multipart file upload.
- Stores file.
- Creates `DocumentImportJob`.
- Enqueues worker.
- Returns `{ jobId }`.

`GET /api/courses/[courseId]/imports`

- Requires course owner/admin.
- Lists jobs for the course.
- Includes status, stage, queue position, error, timestamps.

`GET /api/courses/[courseId]/imports/[jobId]`

- Requires course owner/admin.
- Returns one job with generated draft references.

`POST /api/courses/[courseId]/imports/[jobId]/retry`

- Requires course owner/admin.
- Requeues failed job.

`DELETE /api/courses/[courseId]/imports/[jobId]`

- Requires course owner/admin.
- Deletes job record and associated draft outputs when safe.

### Teacher Review And Publish APIs

`POST /api/courses/[courseId]/imports/[jobId]/apply-structure`

- Applies reviewed structure to `Chapter` and `Lesson`.
- Does not publish knowledge map or AI artifacts.

`POST /api/courses/[courseId]/knowledge-maps/[mapId]/publish`

- Publishes selected knowledge map version.
- Unpublishes older active version if needed.

`POST /api/courses/[courseId]/ai-artifacts/[artifactId]/publish`

- Publishes selected artifact version, including `html_courseware`.

### Student Read APIs

`GET /api/courses/[courseId]/published-structure`

- Requires course access.
- Returns only published/active course structure.

`GET /api/courses/[courseId]/knowledge-map`

- Requires course access.
- Returns latest `PUBLISHED` map only.

`GET /api/courses/[courseId]/html-courseware`

- Requires course access.
- Returns latest `PUBLISHED` HTML courseware artifact only.

## HTML Courseware Contract

`html_courseware` should be a generated artifact, not a hand-edited course model.

Payload shape:

```ts
type HtmlCoursewarePayload = {
  html: string;
  slideCount: number;
  sourceMapId?: string;
  theme?: string;
  generatedAt: string;
};
```

First version playback requirements:

- self-contained HTML where possible
- cover slide
- outline slide
- knowledge point slides
- case/example slides
- summary slide
- keyboard navigation with arrow keys
- fullscreen-friendly layout
- no teacher-only prompt or raw generation logs embedded in student HTML

## Teacher And Student UX Backend Implications

Teacher course page:

- default tab: taught courses
- can create course
- can upload and parse materials
- can see import task center
- can review drafts
- can publish structure, map, and artifacts independently

Student course page:

- default tab: learned courses
- can join by invite code
- cannot create course
- cannot upload/parse/generate
- sees only published content

Backend must support the UI split through separate permission behavior, not just conditional rendering.

## Implementation Order

Current implementation status:

- Done locally: role-based course entry cleanup, neutral AI/Gemini adapter, in-process async import queue with database recovery, single-file and per-course upload quota guards, PDF/DOCX/PPTX/text/Markdown extraction, knowledge map data model, draft knowledge map generation, teacher publish APIs, student published read APIs, teacher import task retry/delete, teacher-side knowledge map publish controls, HTML courseware draft generation/publish controls, and student-facing knowledge map/HTML playback pages.
- Verified locally: `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e -- tests/e2e/ai-import.spec.ts`.
- Still pending for production: Redis/BullMQ queue, PostgreSQL production migration, object storage adapter, per-school storage quota policy, richer knowledge map editor, and broader permission/status-transition regression tests.

1. Role-based course entry cleanup.
   - Teacher defaults to taught courses.
   - Student defaults to learned courses.
   - Hide irrelevant actions and keep backend guards.

2. AI provider compatibility layer.
   - Add neutral `AI_*` env support.
   - Keep `OPENAI_*` fallback.
   - Confirm Gemini-compatible endpoint works through existing SDK or isolate provider-specific handling.

3. Async import queue foundation.
   - Change upload API to return immediately.
   - Add job list/detail polling APIs.
   - Add worker runner.
   - Local dev can use an in-process/database queue first; production target is Redis/BullMQ.

4. Knowledge map data model.
   - Add `CourseKnowledgeMap`, `KnowledgeNode`, `KnowledgeEdge`.
   - Generate draft map from parsed text and outline.
   - Add teacher review endpoint.

5. HTML courseware generation.
   - Add `html_courseware` app type.
   - Generate playable HTML from reviewed knowledge map.
   - Add preview and publish endpoints.

6. Publishing and student read path.
   - Add status/version fields.
   - Ensure student APIs only return `PUBLISHED`.
   - Add tests for permission boundaries.

7. Production database/queue migration.
   - Switch production `DATABASE_URL` to PostgreSQL.
   - Add Redis/BullMQ deployment config.
   - Keep SQLite available for local development if needed.

## Verification Plan

Automated checks:

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

New tests to add:

- student cannot call teacher import/generation APIs
- teacher can create import job and receive `QUEUED`
- job status transitions are valid
- failed job preserves error and can retry
- student sees only published knowledge map and HTML courseware
- unpublished drafts are invisible to enrolled students
- AI env resolution prefers `AI_*` and falls back to `OPENAI_*`

Manual checks:

- Teacher can upload a document and see it enter the task list.
- Teacher sees queue/stage/failure feedback.
- Teacher can review draft structure and knowledge map.
- Teacher can publish map and HTML courseware independently.
- Student can join course and play published HTML courseware.
- Student cannot see teacher drafts, prompts, logs, or failed job details.

## Open Decisions

- Exact production deployment target and whether Redis is already available.
- Whether first implementation should migrate immediately to PostgreSQL or keep SQLite until backend features stabilize.
- Maximum upload file size and per-school storage quota.
- Whether PPTX parsing is required in the first coding pass or can follow PDF/DOCX/text.
