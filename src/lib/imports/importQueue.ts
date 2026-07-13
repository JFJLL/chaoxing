import { runImportJob } from "@/lib/imports/runImportJob";
import { db } from "@/lib/db";
import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";
import { maxCourseUploadBytes, maxInstitutionUploadBytes } from "@/lib/storage";

const pendingJobs: string[] = [];
const scheduledJobs = new Set<string>();
const runningJobs = new Set<string>();
let activeWorkers = 0;

const RECOVERABLE_ACTIVE_STATUSES = ["EXTRACTING", "STRUCTURING", "MAPPING"];
const ACTIVE_BACKLOG_STATUSES = ["QUEUED", "EXTRACTING", "STRUCTURING", "MAPPING"];
const RECOVERY_BATCH_SIZE = 25;
const MAX_IN_MEMORY_IMPORT_JOBS = 100;
const MAX_GLOBAL_ACTIVE_IMPORTS = 100;
const MAX_COURSE_ACTIVE_IMPORTS = 20;
const MAX_USER_ACTIVE_IMPORTS = 30;

const importRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 5,
  windowMs: 10 * 60 * 1000,
  maxConcurrent: 1
});

const institutionByteReservations = new Map<string, number>();
const courseByteReservations = new Map<string, number>();
const courseBacklogReservations = new Map<string, number>();
const userBacklogReservations = new Map<string, number>();
let globalBacklogReservations = 0;
let admissionTail = Promise.resolve();

// Admission reservations are intentionally process-local. They close races for
// the supported SQLite single-instance deployment; multiple app instances need
// a database transaction/lock or a distributed reservation service instead.

export class ImportAdmissionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 429 | 503,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "ImportAdmissionError";
  }
}

function mapValue(map: Map<string, number>, key: string) {
  return map.get(key) ?? 0;
}

function increment(map: Map<string, number>, key: string, amount: number) {
  const next = mapValue(map, key) + amount;
  if (next === 0) map.delete(key);
  else map.set(key, next);
}

async function withAdmissionLock<T>(callback: () => Promise<T>) {
  const previous = admissionTail;
  let unlock!: () => void;
  admissionTail = new Promise<void>((resolve) => { unlock = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    unlock();
  }
}

export function acquireImportRequest(userId: string, courseId: string) {
  return importRequestGuard.acquire(`${userId}:${courseId}`);
}

export function resetImportRequestGuard() {
  importRequestGuard.reset();
}

export function resetImportAdmissionState() {
  institutionByteReservations.clear();
  courseByteReservations.clear();
  courseBacklogReservations.clear();
  userBacklogReservations.clear();
  globalBacklogReservations = 0;
  admissionTail = Promise.resolve();
}

export async function reserveImportJobAdmission(input: {
  institutionId: string;
  courseId: string;
  userId: string;
  fileSize: number;
}) {
  return withAdmissionLock(async () => {
    const [courseUsage, institutionUsage, globalActive, courseActive, userActive] = await Promise.all([
      db.documentImportJob.aggregate({ where: { courseId: input.courseId }, _sum: { fileSize: true } }),
      db.documentImportJob.aggregate({ where: { course: { institutionId: input.institutionId } }, _sum: { fileSize: true } }),
      db.documentImportJob.count({ where: { status: { in: ACTIVE_BACKLOG_STATUSES } } }),
      db.documentImportJob.count({ where: { courseId: input.courseId, status: { in: ACTIVE_BACKLOG_STATUSES } } }),
      db.documentImportJob.count({ where: { userId: input.userId, status: { in: ACTIVE_BACKLOG_STATUSES } } })
    ]);

    const courseBytes = (courseUsage._sum.fileSize ?? 0) + mapValue(courseByteReservations, input.courseId);
    if (courseBytes + input.fileSize > maxCourseUploadBytes()) {
      throw new ImportAdmissionError("AI_IMPORT_COURSE_QUOTA_EXCEEDED", "课程上传总量已达到上限", 400, false);
    }
    const institutionBytes = (institutionUsage._sum.fileSize ?? 0) + mapValue(institutionByteReservations, input.institutionId);
    if (institutionBytes + input.fileSize > maxInstitutionUploadBytes()) {
      throw new ImportAdmissionError("AI_IMPORT_INSTITUTION_QUOTA_EXCEEDED", "学校上传总量已达到上限", 400, false);
    }
    if (globalActive + globalBacklogReservations >= MAX_GLOBAL_ACTIVE_IMPORTS) {
      throw new ImportAdmissionError("AI_IMPORT_GLOBAL_BACKLOG_FULL", "导入服务当前任务已满，请稍后重试", 503, true);
    }
    if (courseActive + mapValue(courseBacklogReservations, input.courseId) >= MAX_COURSE_ACTIVE_IMPORTS) {
      throw new ImportAdmissionError("AI_IMPORT_COURSE_BACKLOG_FULL", "当前课程的导入任务过多，请稍后重试", 429, true);
    }
    if (userActive + mapValue(userBacklogReservations, input.userId) >= MAX_USER_ACTIVE_IMPORTS) {
      throw new ImportAdmissionError("AI_IMPORT_USER_BACKLOG_FULL", "你的导入任务过多，请稍后重试", 429, true);
    }

    increment(courseByteReservations, input.courseId, input.fileSize);
    increment(institutionByteReservations, input.institutionId, input.fileSize);
    increment(courseBacklogReservations, input.courseId, 1);
    increment(userBacklogReservations, input.userId, 1);
    globalBacklogReservations += 1;
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        increment(courseByteReservations, input.courseId, -input.fileSize);
        increment(institutionByteReservations, input.institutionId, -input.fileSize);
        increment(courseBacklogReservations, input.courseId, -1);
        increment(userBacklogReservations, input.userId, -1);
        globalBacklogReservations = Math.max(0, globalBacklogReservations - 1);
      }
    };
  });
}

function importQueueProvider() {
  return (process.env.IMPORT_QUEUE_PROVIDER || "in-process").toLowerCase();
}

function assertSupportedQueueProvider() {
  const provider = importQueueProvider();
  if (provider !== "in-process") {
    throw new Error(`IMPORT_QUEUE_PROVIDER=${provider} is not supported in this build; use in-process or add a Redis/BullMQ worker`);
  }
}

function maxImportWorkers() {
  const value = Number(process.env.MAX_IMPORT_WORKERS || 2);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
}

function drainImportQueue() {
  while (activeWorkers < maxImportWorkers() && pendingJobs.length > 0) {
    const jobId = pendingJobs.shift();
    if (!jobId) return;
    runningJobs.add(jobId);
    activeWorkers += 1;

    void runImportJob(jobId)
      .catch(() => {
        // runImportJob persists the failure on the job record.
      })
      .finally(() => {
        runningJobs.delete(jobId);
        scheduledJobs.delete(jobId);
        activeWorkers -= 1;
        drainImportQueue();
      });
  }
}

export function enqueueImportJob(jobId: string) {
  assertSupportedQueueProvider();
  if (scheduledJobs.has(jobId) || pendingJobs.includes(jobId)) return false;
  if (scheduledJobs.size >= MAX_IN_MEMORY_IMPORT_JOBS) return false;
  scheduledJobs.add(jobId);
  pendingJobs.push(jobId);
  drainImportQueue();
  return true;
}

function staleJobCutoff() {
  const value = Number(process.env.IMPORT_JOB_STALE_MINUTES || 30);
  const minutes = Number.isFinite(value) && value > 0 ? value : 30;
  return new Date(Date.now() - minutes * 60 * 1000);
}

export async function recoverImportJobsFromDatabase(courseId?: string) {
  assertSupportedQueueProvider();
  const staleCutoff = staleJobCutoff();
  let cursor: string | undefined;
  let scanned = 0;
  while (scheduledJobs.size < MAX_IN_MEMORY_IMPORT_JOBS) {
    const take = Math.min(RECOVERY_BATCH_SIZE, MAX_IN_MEMORY_IMPORT_JOBS - scheduledJobs.size);
    const staleJobs = await db.documentImportJob.findMany({
      where: {
        ...(courseId ? { courseId } : {}),
        OR: [
          { status: "QUEUED" },
          {
            status: { in: RECOVERABLE_ACTIVE_STATUSES },
            updatedAt: { lt: staleCutoff }
          }
        ]
      },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, status: true }
    });
    if (staleJobs.length === 0) break;
    scanned += staleJobs.length;
    cursor = staleJobs.at(-1)!.id;

    const recoverableJobs = staleJobs.filter((job) => !runningJobs.has(job.id) && !scheduledJobs.has(job.id));
    const staleActiveJobIds = recoverableJobs
      .filter((job) => RECOVERABLE_ACTIVE_STATUSES.includes(job.status))
      .map((job) => job.id);
    if (staleActiveJobIds.length) {
      await db.documentImportJob.updateMany({
        where: { id: { in: staleActiveJobIds } },
        data: { status: "QUEUED", currentStage: "等待恢复处理", startedAt: null, finishedAt: null }
      });
    }
    for (const job of recoverableJobs) enqueueImportJob(job.id);
    if (staleJobs.length < take) break;
  }

  return scanned;
}

export function getImportQueueSnapshot() {
  assertSupportedQueueProvider();
  return {
    activeWorkers,
    pendingJobs: [...pendingJobs]
  };
}
