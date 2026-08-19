"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getImportBatchActionLabel,
  getImportBatchProgress
} from "@/lib/imports/importBatchProgress";
import { DeleteImportBatchButton } from "@/components/ai-import/DeleteImportBatchButton";

export type ImportBatchDocument = {
  id: string;
  originalName: string;
  status: string;
  errorMessage: string | null;
};

export type ImportBatchCard = {
  batchId: string;
  status: string;
  representativeJobId: string;
  documents: ImportBatchDocument[];
};

const documentStatusLabels: Record<string, string> = {
  QUEUED: "排队中",
  EXTRACTING: "解析中",
  GENERATING: "生成中",
  STRUCTURING: "生成中",
  MAPPING: "生成中",
  READY_FOR_REVIEW: "待确认",
  APPLIED: "已保存",
  FAILED: "失败"
};

export function ImportBatchTimeline({ courseId, batch }: { courseId: string; batch: ImportBatchCard }) {
  const [expanded, setExpanded] = useState(false);
  const progress = getImportBatchProgress(batch.status);
  const actionLabel = getImportBatchActionLabel(progress.state);
  const actionHref = progress.state === "applied"
    ? `/space/courses/${courseId}/builder`
    : `/space/courses/${courseId}/ai-import/${batch.representativeJobId}${progress.state === "review" ? "#outline-review" : ""}`;
  const panelId = `import-batch-${batch.batchId}`;

  return (
    <div className="rounded-md border border-[var(--cx-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800">本次导入 · {batch.documents.length}份资料</span>
            <span className="mt-0.5 block text-xs text-slate-500">{progress.label}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#A8402F]">
            {expanded ? "收起" : "展开"}
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-3">
          <Link prefetch={false} className="text-sm font-medium text-[var(--cx-blue)]" href={actionHref}>{actionLabel}</Link>
          <DeleteImportBatchButton courseId={courseId} batchId={batch.batchId} applied={batch.status === "APPLIED"} />
        </span>
      </div>
      {expanded ? (
        <ul id={panelId} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {batch.documents.map((document) => (
            <li key={document.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">{document.originalName}</span>
              <span className="shrink-0 text-xs text-slate-500">{documentStatusLabels[document.status] ?? document.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
