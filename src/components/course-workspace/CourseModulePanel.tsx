import type { ReactNode } from "react";

export const courseModuleLinkCardClassName =
  "cx-focus-ring cx-tactile group flex min-h-44 flex-col rounded-2xl border border-[var(--cx-border)] bg-slate-50/80 p-5 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-[var(--cx-blue-soft)] hover:shadow-floating";

export function CourseModulePanel({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-panel sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {actions}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
