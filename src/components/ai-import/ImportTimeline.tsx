import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { getImportStepStates, getQueueLabel } from "@/lib/imports/importProgress";

const stepStateLabels = {
  complete: "已完成",
  active: "进行中",
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

  return (
    <div className="space-y-3">
      {currentStage || showQueueLabel || pollError ? (
        <div role="status" aria-live="polite" className="space-y-3">
          {currentStage || showQueueLabel ? (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
              {currentStage ? <p className="text-sm font-medium text-blue-900">{currentStage}</p> : null}
              {showQueueLabel ? <p className="mt-1 text-xs text-blue-700">{getQueueLabel(jobsAhead ?? null)}</p> : null}
            </div>
          ) : null}
          {pollError ? <p className="rounded-md border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-700">{pollError}</p> : null}
        </div>
      ) : null}
      <ol aria-label="文档建课进度" className="grid gap-3 md:grid-cols-6">
        {steps.map((step) => (
          <li
            key={step.key}
            aria-label={`${step.label}：${stepStateLabels[step.state]}`}
            className="flex items-center gap-2 rounded-md border border-[var(--cx-border)] bg-white p-3 text-sm"
          >
            {step.state === "complete" ? (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            ) : step.state === "active" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-blue-600" />
            ) : (
              <Circle aria-hidden="true" className="h-4 w-4 text-slate-300" />
            )}
            <span className={step.state === "pending" ? "text-slate-500" : "font-medium text-slate-900"}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
