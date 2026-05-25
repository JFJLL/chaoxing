import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title = "暂无内容", description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-[var(--cx-border)] bg-slate-50 p-8 text-center">
      <Inbox className="h-10 w-10 text-slate-300" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold text-slate-700">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
