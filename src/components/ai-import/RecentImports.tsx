import Link from "next/link";
import { db } from "@/lib/db";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { ImportBatchTimeline } from "@/components/ai-import/ImportBatchTimeline";
import { DeleteImportRecordButton } from "@/components/ai-import/DeleteImportRecordButton";

type RecentEntry =
  | {
      kind: "batch";
      id: string;
      createdAt: Date;
      status: string;
      representativeJobId: string;
      documents: Array<{ id: string; originalName: string; status: string; errorMessage: string | null }>;
    }
  | {
      kind: "legacy";
      id: string;
      createdAt: Date;
      originalName: string;
      status: string;
      errorMessage: string | null;
    };

export async function RecentImports({ courseId }: { courseId: string }) {
  const [batches, legacyJobs] = await Promise.all([
    db.documentImportBatch.findMany({
      where: { courseId, documents: { some: { deletedAt: null } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        generatedOutlineVersion: true,
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, originalName: true, status: true, errorMessage: true }
        }
      }
    }),
    // Historical imports predate batches; keep showing them individually.
    db.documentImportJob.findMany({
      where: { courseId, deletedAt: null, batchId: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, originalName: true, status: true, errorMessage: true, createdAt: true }
    })
  ]);

  const entries: RecentEntry[] = [
    ...batches
      .filter((batch) => batch.documents.length > 0)
      .map((batch) => ({
        kind: "batch" as const,
        id: batch.id,
        createdAt: batch.createdAt,
        status: batch.status,
        representativeJobId: batch.documents[0]!.id,
        documents: batch.documents
      })),
    ...legacyJobs.map((job) => ({
      kind: "legacy" as const,
      id: job.id,
      createdAt: job.createdAt,
      originalName: job.originalName,
      status: job.status,
      errorMessage: job.errorMessage
    }))
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-slate-900">最近导入</h2>
      {entries.map((entry) =>
        entry.kind === "batch" ? (
          <ImportBatchTimeline
            key={entry.id}
            courseId={courseId}
            batch={{
              batchId: entry.id,
              status: entry.status,
              representativeJobId: entry.representativeJobId,
              documents: entry.documents
            }}
          />
        ) : (
          <div key={entry.id} className="rounded-md border border-[var(--cx-border)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800">历史单文档导入 · {entry.originalName}</span>
              <span className="flex items-center gap-3"><Link prefetch={false} className="text-[var(--cx-blue)]" href={`/space/courses/${courseId}/ai-import/${entry.id}#outline-review`}>查看并确认</Link><DeleteImportRecordButton jobId={entry.id} /></span>
            </div>
            <ImportTimeline
              status={entry.status}
              errorMessage={entry.errorMessage}
              retryHref={`/space/courses/${courseId}/ai-workbench/content`}
            />
          </div>
        )
      )}
      {!entries.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无导入记录。</p> : null}
    </section>
  );
}
