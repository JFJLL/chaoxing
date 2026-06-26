import { runImportJob } from "@/lib/imports/runImportJob";

const pendingJobs: string[] = [];
const scheduledJobs = new Set<string>();
let activeWorkers = 0;

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
  if (scheduledJobs.has(jobId)) return;
  scheduledJobs.add(jobId);
  pendingJobs.push(jobId);
  drainImportQueue();
}

export function getImportQueueSnapshot() {
  return {
    activeWorkers,
    pendingJobs: [...pendingJobs]
  };
}
