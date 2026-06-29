import { runImportJob } from "@/lib/imports/runImportJob";
import { db } from "@/lib/db";

const pendingJobs: string[] = [];
const scheduledJobs = new Set<string>();
let activeWorkers = 0;

const RECOVERABLE_ACTIVE_STATUSES = ["EXTRACTING", "STRUCTURING", "MAPPING"];

function maxImportWorkers() {
  const value = Number(process.env.MAX_IMPORT_WORKERS || 2);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
}

function drainImportQueue() {
  while (activeWorkers < maxImportWorkers() && pendingJobs.length > 0) {
    const jobId = pendingJobs.shift();
    if (!jobId) return;
    scheduledJobs.delete(jobId);
    activeWorkers += 1;

    void runImportJob(jobId)
      .catch(() => {
        // runImportJob persists the failure on the job record.
      })
      .finally(() => {
        activeWorkers -= 1;
        drainImportQueue();
      });
  }
}

export function enqueueImportJob(jobId: string) {
  if (scheduledJobs.has(jobId) || pendingJobs.includes(jobId)) return;
  scheduledJobs.add(jobId);
  pendingJobs.push(jobId);
  drainImportQueue();
}

function staleJobCutoff() {
  const value = Number(process.env.IMPORT_JOB_STALE_MINUTES || 30);
  const minutes = Number.isFinite(value) && value > 0 ? value : 30;
  return new Date(Date.now() - minutes * 60 * 1000);
}

export async function recoverImportJobsFromDatabase(courseId?: string) {
  const staleCutoff = staleJobCutoff();
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
    select: { id: true, status: true }
  });

  const staleActiveJobIds = staleJobs
    .filter((job) => RECOVERABLE_ACTIVE_STATUSES.includes(job.status))
    .map((job) => job.id);
  if (staleActiveJobIds.length) {
    await db.documentImportJob.updateMany({
      where: { id: { in: staleActiveJobIds } },
      data: { status: "QUEUED", currentStage: "等待恢复处理", startedAt: null, finishedAt: null }
    });
  }

  for (const job of staleJobs) {
    enqueueImportJob(job.id);
  }

  return staleJobs.length;
}

export function getImportQueueSnapshot() {
  return {
    activeWorkers,
    pendingJobs: [...pendingJobs]
  };
}
