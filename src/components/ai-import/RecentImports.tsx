import Link from "next/link";
import { db } from "@/lib/db";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { DeleteImportRecordButton } from "@/components/ai-import/DeleteImportRecordButton";

export async function RecentImports({ courseId }: { courseId: string }) {
  const imports = await db.documentImportJob.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      originalName: true,
      status: true,
      errorMessage: true
    }
  });

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-slate-900">最近导入</h2>
      {imports.map((job) => (
        <div key={job.id} className="rounded-md border border-[var(--cx-border)] p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-800">{job.originalName}</span>
            <span className="flex items-center gap-3"><Link prefetch={false} className="text-[var(--cx-blue)]" href={`/space/courses/${courseId}/ai-import/${job.id}#outline-review`}>查看并确认</Link><DeleteImportRecordButton jobId={job.id} /></span>
          </div>
          <ImportTimeline
            status={job.status}
            errorMessage={job.errorMessage}
            retryHref={`/space/courses/${courseId}/ai-workbench/content`}
          />
        </div>
      ))}
      {!imports.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无导入记录。</p> : null}
    </section>
  );
}
