import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { OutlineReviewEditor } from "@/components/ai-import/OutlineReviewEditor";
import type { GeneratedCourseOutline } from "@/types/course";

type PageProps = {
  params: Promise<{ courseId: string; jobId: string }>;
};

export default async function AiImportReviewPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, jobId } = await params;
  await requireCourseOwner(user, courseId);
  const job = await db.documentImportJob.findFirst({
    where: { id: jobId, courseId },
    include: { course: true }
  });

  if (!job) notFound();
  const outline = job.generatedOutline ? (JSON.parse(job.generatedOutline) as GeneratedCourseOutline) : null;

  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--cx-border)] pb-5">
        <p className="text-sm text-slate-500">{job.course.title}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">AI 文档建课</h1>
        <p className="mt-1 text-sm text-slate-500">{job.originalName}</p>
      </header>
      <ImportTimeline status={job.status} errorMessage={job.errorMessage} retryHref={`/space/courses/${courseId}/ai-import`} />
      {job.warning ? <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-700">{job.warning}</p> : null}
      {outline ? <OutlineReviewEditor jobId={job.id} courseId={courseId} initialOutline={outline} /> : null}
    </div>
  );
}
