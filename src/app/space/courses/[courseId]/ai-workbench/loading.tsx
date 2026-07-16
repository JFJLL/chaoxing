export default function AiWorkbenchLoading() {
  return (
    <div role="status" aria-label="正在打开备课任务" className="space-y-5">
      <div className="rounded-[28px] bg-white p-6 shadow-sm">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="h-[420px] animate-pulse rounded-2xl bg-white shadow-sm" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-white shadow-sm" />
      </div>
      <span className="sr-only">正在打开备课任务</span>
    </div>
  );
}
