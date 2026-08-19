import { CheckCircle2, Circle, CircleAlert, Loader2, XCircle } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { getImportStepStates, getQueueLabel } from "@/lib/imports/importProgress";

const stepStateLabels = {
  complete: "已完成",
  active: "进行中",
  attention: "需要操作",
  pending: "未开始"
} as const;

export function ImportTimeline({
  status,
  errorMessage,
  retryHref,
  currentStage,
  jobsAhead,
  pollError
}: {
  status: string;
  errorMessage?: string | null;
  retryHref?: string;
  currentStage?: string | null;
  jobsAhead?: number | null;
  pollError?: string;
}) {
  if (status === "FAILED") {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-4 text-red-700">
        <div className="flex items-center gap-2 font-medium">
          <XCircle aria-hidden="true" className="h-4 w-4" />
          导入失败
        </div>
        <p className="mt-2 text-sm">{errorMessage ?? "请重新上传文档。"}</p>
        {retryHref ? (
          <LinkButton href={retryHref} variant="secondary" className="mt-4">
            返回上传
          </LinkButton>
        ) : null}
      </div>
    );
  }

  const steps = getImportStepStates(status);
  const showQueueLabel = status === "QUEUED" && jobsAhead !== undefined;
  const needsReview = status === "READY_FOR_REVIEW";
  const showProcessingNotice = !needsReview && status !== "APPLIED" && (currentStage || showQueueLabel || pollError);

  return (
    <div className="space-y-3">
      {needsReview ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-900">AI 已完成课程结构，请检查后应用到课程。</p>
            <p className="mt-1 text-xs text-orange-700">系统处理已结束，现在需要你确认生成结果。</p>
          </div>
          <a href="#outline-review" className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            查看并确认
          </a>
        </div>
      ) : showProcessingNotice ? (
        <div role="status" aria-live="polite" className="space-y-3">
          {currentStage || showQueueLabel ? (
            <div className="rounded-md border border-[#F9ECE7] bg-[#FDF3F0] px-4 py-3">
              {currentStage ? <p className="text-sm font-medium text-[#522017]">{currentStage}</p> : null}
              {showQueueLabel ? <p className="mt-1 text-xs text-[#8E3425]">{getQueueLabel(jobsAhead ?? null)}</p> : null}
            </div>
          ) : null}
          {pollError ? <p className="rounded-md border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-700">{pollError}</p> : null}
        </div>
      ) : null}
      <ol aria-label="课程文档导入进度" className="grid gap-3 md:grid-cols-6">
        {steps.map((step) => (
          <li
            key={step.key}
            aria-label={`${step.label}：${stepStateLabels[step.state]}`}
            className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
              step.state === "attention" ? "border-orange-200 bg-orange-50" : "border-[var(--cx-border)] bg-white"
            }`}
          >
            {step.state === "complete" ? (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            ) : step.state === "active" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-[#A8402F]" />
            ) : step.state === "attention" ? (
              <CircleAlert aria-hidden="true" className="h-4 w-4 text-orange-600" />
            ) : (
              <Circle aria-hidden="true" className="h-4 w-4 text-slate-300" />
            )}
            <span className={step.state === "pending" ? "text-slate-500" : step.state === "attention" ? "font-medium text-orange-900" : "font-medium text-slate-900"}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
