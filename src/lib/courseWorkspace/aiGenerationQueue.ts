import { z } from "zod";
import { db } from "@/lib/db";
import { runAiGenerationJob } from "@/lib/courseWorkspace/runAiGenerationJob";
import {
  aiCoursewarePayloadSchema,
  type CourseAiAppType
} from "@/types/courseWorkspace";
import type {
  ApprovedQuestionInput,
  GenerateCourseAiArtifactInput
} from "@/lib/courseWorkspace/generateAiArtifact";
import { courseAiContextSchema } from "@/lib/courseWorkspace/buildAiContext";

const appTypeSchema = z.enum([
  "question_generation",
  "lesson_plan",
  "courseware",
  "paper_assembly",
  "html_courseware"
]);
const approvedQuestionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.enum(["single_choice", "multiple_choice", "short_answer"]),
  stem: z.string().trim().min(1).max(10_000)
}).strict();

const generationSnapshotSchema = z.discriminatedUnion("appType", [
  z.object({ appType: z.literal("question_generation"), context: courseAiContextSchema }).strict(),
  z.object({ appType: z.literal("lesson_plan"), context: courseAiContextSchema }).strict(),
  z.object({ appType: z.literal("courseware"), context: courseAiContextSchema }).strict(),
  z.object({
    appType: z.literal("paper_assembly"),
    context: courseAiContextSchema,
    approvedQuestions: z.array(approvedQuestionSchema).min(1).max(500)
  }).strict(),
  z.object({
    appType: z.literal("html_courseware"),
    sourceCourseware: aiCoursewarePayloadSchema,
    prompt: z.string().max(2_000).optional()
  }).strict()
]);

export class AiGenerationInputError extends Error {
  readonly code = "AI_GENERATION_INPUT_INVALID";

  constructor() {
    super("AI_GENERATION_INPUT_INVALID");
    this.name = "AiGenerationInputError";
  }
}

export function parseAiGenerationInputSnapshot(
  raw: string | null,
  expectedAppType: string
): GenerateCourseAiArtifactInput {
  if (!raw) throw new AiGenerationInputError();
  try {
    const parsed = generationSnapshotSchema.parse(JSON.parse(raw));
    if (parsed.appType !== expectedAppType) throw new AiGenerationInputError();
    if (parsed.appType === "paper_assembly") {
      return {
        appType: parsed.appType,
        context: parsed.context as GenerateCourseAiArtifactInput["context"],
        approvedQuestions: parsed.approvedQuestions as ApprovedQuestionInput[]
      };
    }
    if (parsed.appType === "html_courseware") {
      return parsed;
    }
    return {
      appType: parsed.appType,
      context: parsed.context as GenerateCourseAiArtifactInput["context"]
    };
  } catch (error) {
    if (error instanceof AiGenerationInputError) throw error;
    throw new AiGenerationInputError();
  }
}

export type SafeAiArtifactRecord = {
  id: string;
  seriesId: string;
  courseId: string;
  userId: string;
  appType: string;
  title: string;
  prompt: string | null;
  payload: string | null;
  inputSnapshot?: string | null;
  runToken?: string | null;
  scope: string | null;
  status: string;
  version: number;
  errorCode: string | null;
  errorMessage: string | null;
  sourceJobId: string | null;
  sourceArtifactId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const safeAiArtifactSelect = {
  id: true,
  seriesId: true,
  courseId: true,
  userId: true,
  appType: true,
  title: true,
  prompt: true,
  payload: true,
  scope: true,
  status: true,
  version: true,
  errorCode: true,
  errorMessage: true,
  sourceJobId: true,
  sourceArtifactId: true,
  startedAt: true,
  finishedAt: true,
  approvedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export function toSafeAiArtifactDto(
  record: SafeAiArtifactRecord,
  options: { canManage: boolean; jobsAhead: number | null }
) {
  if (!options.canManage) {
    return {
      id: record.id,
      appType: record.appType,
      title: record.title,
      payload: record.payload,
      version: record.version,
      status: record.status,
      publishedAt: record.publishedAt,
      createdAt: record.createdAt
    };
  }
  const {
    inputSnapshot: _inputSnapshot,
    runToken: _runToken,
    errorCode,
    errorMessage,
    ...safe
  } = record;
  return {
    ...safe,
    errorCode,
    errorMessage,
    jobsAhead: options.jobsAhead
  };
}

export function canRetryAiGeneration(status: string) {
  return status === "FAILED";
}

const pendingJobs: string[] = [];
const scheduledJobs = new Set<string>();
const runningJobs = new Set<string>();
let activeWorkers = 0;

const ACTIVE_GENERATION_STATUSES = ["QUEUED", "GENERATING"] as const;
const GLOBAL_BACKLOG_LIMIT = 200;
const COURSE_BACKLOG_LIMIT = 30;
const USER_BACKLOG_LIMIT = 50;
let reservedGlobal = 0;
const reservedByCourse = new Map<string, number>();
const reservedByUser = new Map<string, number>();
let admissionTail = Promise.resolve();

function withAdmissionLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = admissionTail;
  let release!: () => void;
  admissionTail = new Promise<void>((resolve) => { release = resolve; });
  return previous.then(operation).finally(release);
}

export type AiGenerationBacklogReservation =
  | { allowed: false; reason: "global" | "course" | "user" }
  | { allowed: true; release: () => Promise<void> };

export function acquireAiGenerationBacklogReservation(input: {
  courseId: string;
  userId: string;
}): Promise<AiGenerationBacklogReservation> {
  return withAdmissionLock(async () => {
    const where = { status: { in: [...ACTIVE_GENERATION_STATUSES] } };
    const [globalCount, courseCount, userCount] = await Promise.all([
      db.courseAiArtifact.count({ where }),
      db.courseAiArtifact.count({ where: { ...where, courseId: input.courseId } }),
      db.courseAiArtifact.count({ where: { ...where, userId: input.userId } })
    ]);
    if (globalCount + reservedGlobal >= GLOBAL_BACKLOG_LIMIT) return { allowed: false, reason: "global" };
    if (courseCount + (reservedByCourse.get(input.courseId) ?? 0) >= COURSE_BACKLOG_LIMIT) {
      return { allowed: false, reason: "course" };
    }
    if (userCount + (reservedByUser.get(input.userId) ?? 0) >= USER_BACKLOG_LIMIT) {
      return { allowed: false, reason: "user" };
    }

    reservedGlobal += 1;
    reservedByCourse.set(input.courseId, (reservedByCourse.get(input.courseId) ?? 0) + 1);
    reservedByUser.set(input.userId, (reservedByUser.get(input.userId) ?? 0) + 1);
    let releasePromise: Promise<void> | null = null;
    return {
      allowed: true,
      release() {
        releasePromise ??= withAdmissionLock(async () => {
          reservedGlobal = Math.max(0, reservedGlobal - 1);
          const courseReservations = Math.max(0, (reservedByCourse.get(input.courseId) ?? 0) - 1);
          const userReservations = Math.max(0, (reservedByUser.get(input.userId) ?? 0) - 1);
          if (courseReservations === 0) reservedByCourse.delete(input.courseId);
          else reservedByCourse.set(input.courseId, courseReservations);
          if (userReservations === 0) reservedByUser.delete(input.userId);
          else reservedByUser.set(input.userId, userReservations);
        });
        return releasePromise;
      }
    };
  });
}

function queueProvider() {
  return (process.env.AI_GENERATION_QUEUE_PROVIDER || "in-process").toLowerCase();
}

function assertSupportedQueueProvider() {
  const provider = queueProvider();
  if (provider !== "in-process") {
    throw new Error(`AI_GENERATION_QUEUE_PROVIDER=${provider} is not supported in this build; use in-process or add a durable worker`);
  }
}

function maxWorkers() {
  const value = Number(process.env.MAX_AI_GENERATION_WORKERS || 2);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
}

function maxPendingJobs() {
  const value = Number(process.env.MAX_AI_GENERATION_PENDING_JOBS || 200);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200;
}

function recoveryBatchSize() {
  const value = Number(process.env.AI_GENERATION_RECOVERY_BATCH_SIZE || 50);
  return Number.isFinite(value) && value > 0 ? Math.min(200, Math.floor(value)) : 50;
}

function drainQueue() {
  while (activeWorkers < maxWorkers() && pendingJobs.length > 0) {
    const artifactId = pendingJobs.shift();
    if (!artifactId) return;
    runningJobs.add(artifactId);
    activeWorkers += 1;
    void runAiGenerationJob(artifactId)
      .catch(() => {
        // The runner persists a safe failure on the artifact record.
      })
      .finally(() => {
        runningJobs.delete(artifactId);
        scheduledJobs.delete(artifactId);
        activeWorkers -= 1;
        drainQueue();
      });
  }
}

export function enqueueAiGenerationJob(artifactId: string) {
  assertSupportedQueueProvider();
  if (scheduledJobs.has(artifactId)) return true;
  if (pendingJobs.length >= maxPendingJobs()) return false;
  scheduledJobs.add(artifactId);
  pendingJobs.push(artifactId);
  drainQueue();
  return true;
}

function staleCutoff() {
  const value = Number(process.env.AI_GENERATION_JOB_STALE_MINUTES || 30);
  const minutes = Number.isFinite(value) && value > 0 ? value : 30;
  return new Date(Date.now() - minutes * 60 * 1000);
}

type RecoverableGenerationJob = {
  id: string;
  courseId: string;
  status: string;
  runToken: string | null;
};

async function prepareGenerationJobForRecovery(job: RecoverableGenerationJob) {
  if (scheduledJobs.has(job.id) || runningJobs.has(job.id)) return false;
  if (job.status === "QUEUED") return true;
  const reset = await db.courseAiArtifact.updateMany({
    where: { id: job.id, status: "GENERATING", runToken: job.runToken },
    data: {
      status: "QUEUED",
      runToken: null,
      startedAt: null,
      finishedAt: null,
      errorCode: null,
      errorMessage: null
    }
  });
  return reset.count === 1;
}

export async function recoverAiGenerationJobFromDatabase(courseId: string, artifactId: string) {
  assertSupportedQueueProvider();
  const jobs = await db.courseAiArtifact.findMany({
    where: {
      id: artifactId,
      courseId,
      OR: [
        { status: "QUEUED" },
        { status: "GENERATING", updatedAt: { lt: staleCutoff() } }
      ]
    },
    orderBy: { id: "asc" },
    take: 1,
    select: { id: true, courseId: true, status: true, runToken: true }
  });
  const job = jobs[0];
  if (!job || !(await prepareGenerationJobForRecovery(job))) return false;
  return enqueueAiGenerationJob(job.id);
}

export async function recoverAiGenerationJobsFromDatabase() {
  assertSupportedQueueProvider();
  const batchSize = recoveryBatchSize();
  const pendingLimit = maxPendingJobs();
  if (pendingJobs.length >= pendingLimit) return 0;
  // Admission caps the global active backlog at this size. Scan that complete
  // window before ordering so local queue capacity cannot hide a later course.
  const scanLimit = GLOBAL_BACKLOG_LIMIT;
  let cursor: string | undefined;
  let scanned = 0;
  const ready: Array<{ id: string; courseId: string }> = [];
  while (scanned < scanLimit) {
    const jobs = await db.courseAiArtifact.findMany({
      where: {
        OR: [
          { status: "QUEUED" },
          { status: "GENERATING", updatedAt: { lt: staleCutoff() } }
        ]
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, courseId: true, status: true, runToken: true }
    });
    if (jobs.length === 0) break;
    scanned += jobs.length;
    cursor = jobs.at(-1)!.id;
    for (const job of jobs) {
      if (await prepareGenerationJobForRecovery(job)) {
        ready.push({ id: job.id, courseId: job.courseId });
      }
    }
    if (jobs.length < batchSize) break;
  }
  for (const job of roundRobinByCourse(ready)) {
    if (!enqueueAiGenerationJob(job.id)) break;
  }
  return scanned;
}

function roundRobinByCourse<T extends { courseId: string }>(jobs: T[]) {
  const grouped = new Map<string, T[]>();
  for (const job of jobs) {
    const group = grouped.get(job.courseId) ?? [];
    group.push(job);
    grouped.set(job.courseId, group);
  }
  const result: T[] = [];
  while (result.length < jobs.length) {
    for (const group of grouped.values()) {
      const job = group.shift();
      if (job) result.push(job);
    }
  }
  return result;
}

export function getAiGenerationQueueSnapshot() {
  assertSupportedQueueProvider();
  return { activeWorkers, pendingJobs: [...pendingJobs], runningJobs: [...runningJobs] };
}

export function getAiGenerationJobsAhead(artifactId: string): number | null {
  assertSupportedQueueProvider();
  if (runningJobs.has(artifactId)) return 0;
  const index = pendingJobs.indexOf(artifactId);
  return index < 0 ? null : activeWorkers + index;
}

export function serializeAiGenerationInput(input: GenerateCourseAiArtifactInput) {
  return JSON.stringify(input);
}

export function isSupportedQueuedAppType(appType: CourseAiAppType) {
  return appType === "question_generation"
    || appType === "lesson_plan"
    || appType === "courseware"
    || appType === "paper_assembly"
    || appType === "html_courseware";
}
