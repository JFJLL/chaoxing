import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { recoverImportJobsFromDatabase } from "@/lib/imports/importQueue";
import { UploadPanel } from "@/components/ai-import/UploadPanel";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function AiImportPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  await requireCourseOwner(user, courseId);
  await recoverImportJobsFromDatabase(courseId);
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      imports: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  if (!course) notFound();

  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--cx-border)] pb-5">
        <p className="text-sm text-slate-500">{course.title}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">AI 文档建课</h1>
      </header>
      <UploadPanel courseId={courseId} />
      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900">最近导入</h2>
        {course.imports.map((job) => (
          <div key={job.id} className="rounded-md border border-[var(--cx-border)] p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800">{job.originalName}</span>
              <a className="text-[var(--cx-blue)]" href={`/space/courses/${courseId}/ai-import/${job.id}`}>
                查看
              </a>
            </div>
            <ImportTimeline status={job.status} errorMessage={job.errorMessage} retryHref={`/space/courses/${courseId}/ai-import`} />
          </div>
        ))}
      </section>
    </div>
  );
}
