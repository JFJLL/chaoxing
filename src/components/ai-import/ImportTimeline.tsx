import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";

const steps = [
  { key: "QUEUED", label: "文档上传" },
  { key: "EXTRACTING", label: "内容解析" },
  { key: "STRUCTURING", label: "目录生成" },
  { key: "MAPPING", label: "知识导图" },
  { key: "READY_FOR_REVIEW", label: "等待确认" },
  { key: "APPLIED", label: "已应用" }
];

const rank: Record<string, number> = {
  QUEUED: 0,
  EXTRACTING: 1,
  GENERATING: 2,
  STRUCTURING: 2,
  MAPPING: 3,
  READY_FOR_REVIEW: 4,
  APPLIED: 5
};

export function ImportTimeline({
  status,
  errorMessage,
  retryHref
}: {
  status: string;
  errorMessage?: string | null;
  retryHref?: string;
}) {
  if (status === "FAILED") {
    return (
      <div className="rounded-md border border-red-100 bg-red-50 p-4 text-red-700">
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4" />
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

  const current = rank[status] ?? 0;
  return (
    <ol className="grid gap-3 md:grid-cols-6">
      {steps.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step.key} className="flex items-center gap-2 rounded-md border border-[var(--cx-border)] bg-white p-3 text-sm">
            {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
            <span className={done ? "font-medium text-slate-900" : "text-slate-500"}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
