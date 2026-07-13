export const IMPORT_STEPS = [
  { key: "QUEUED", label: "文档上传" },
  { key: "EXTRACTING", label: "内容解析" },
  { key: "STRUCTURING", label: "目录生成" },
  { key: "MAPPING", label: "知识导图" },
  { key: "READY_FOR_REVIEW", label: "等待确认" },
  { key: "APPLIED", label: "已应用" }
] as const;

export type ImportStepState = "complete" | "active" | "pending";

const IMPORT_JOB_STATUSES = new Set([
  "QUEUED",
  "EXTRACTING",
  "GENERATING",
  "STRUCTURING",
  "MAPPING",
  "READY_FOR_REVIEW",
  "APPLIED",
  "FAILED"
]);

export type ImportPollingJob = {
  status: string;
  currentStage: string | null;
  jobsAhead: number | null;
  errorMessage: string | null;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseImportJobResponse(value: unknown): ImportPollingJob | null {
  if (!value || typeof value !== "object") return null;
  const job = (value as Record<string, unknown>).job;
  if (!job || typeof job !== "object") return null;

  const candidate = job as Record<string, unknown>;
  if (typeof candidate.status !== "string" || !IMPORT_JOB_STATUSES.has(candidate.status)) return null;
  if (!isNullableString(candidate.currentStage) || !isNullableString(candidate.errorMessage)) return null;
  if (
    candidate.jobsAhead !== null &&
    (typeof candidate.jobsAhead !== "number" || !Number.isInteger(candidate.jobsAhead) || candidate.jobsAhead < 0)
  ) {
    return null;
  }

  return {
    status: candidate.status,
    currentStage: candidate.currentStage,
    jobsAhead: candidate.jobsAhead as number | null,
    errorMessage: candidate.errorMessage
  };
}

export function getImportStepStates(status: string) {
  const normalizedStatus = status === "GENERATING" ? "STRUCTURING" : status;
  const currentIndex = IMPORT_STEPS.findIndex((step) => step.key === normalizedStatus);

  return IMPORT_STEPS.map((step, index) => ({
    ...step,
    state: (index < currentIndex ? "complete" : index === currentIndex ? "active" : "pending") as ImportStepState
  }));
}

export function isImportTerminal(status: string) {
  return status === "READY_FOR_REVIEW" || status === "APPLIED" || status === "FAILED";
}

export function getNextPollDelay(status: string) {
  return isImportTerminal(status) ? null : 1500;
}

export function getJobsAhead(activeWorkers: number, queueIndex: number) {
  if (queueIndex < 0) return null;
  return Math.max(0, activeWorkers) + queueIndex;
}

export function getQueueLabel(jobsAhead: number | null) {
  if (jobsAhead === null) return "等待系统处理";
  if (jobsAhead === 0) return "即将开始处理";
  return `前方还有 ${jobsAhead} 个任务`;
}

export function getUploadButtonLabel(submitting: boolean) {
  return submitting ? "正在上传文档" : "提交解析任务";
}
