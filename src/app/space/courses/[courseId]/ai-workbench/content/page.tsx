import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { recoverImportJobsFromDatabase } from "@/lib/imports/importQueue";
import { UploadPanel } from "@/components/ai-import/UploadPanel";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

async function RecentImports({ courseId }: { courseId: string }) {
  await recoverImportJobsFromDatabase(courseId);
  const imports = await db.documentImportJob.findMany({
    where: { courseId },
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
            <Link className="text-[var(--cx-blue)]" href={"/space/courses/" + courseId + "/ai-import/" + job.id}>
              查看
            </Link>
          </div>
          <ImportTimeline
            status={job.status}
            errorMessage={job.errorMessage}
            retryHref={"/space/courses/" + courseId + "/ai-workbench/content"}
          />
        </div>
      ))}
      {!imports.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无导入记录。</p> : null}
    </section>
  );
}

export default async function AiWorkbenchContentPage({ params }: PageProps) {
  const [user, { courseId }] = await Promise.all([requireUser(), params]);
  const course = await requireCourseOwner(user, courseId);

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
      <div className="space-y-6">
        <header className="flex flex-col gap-5 border-b border-[var(--cx-border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">课程内容与知识</h1>
            <p className="mt-1 text-sm text-slate-500">导入文档后生成课程结构与知识关系，并作为后续 AI 备课的依据。</p>
          </div>
          <PrepWorkflowNavigation courseId={course.id} workflow="content" active="import" />
        </header>
        <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
          <h2 className="font-semibold text-blue-950">一次导入，形成完整课程上下文</h2>
          <p className="mt-1 text-sm leading-6 text-blue-800">系统会提炼课程目标、章节课时和知识关系；确认后可直接用于生成教案、题目和课件。</p>
        </section>
        <UploadPanel courseId={courseId} />
        <Suspense fallback={<div role="status" className="h-24 animate-pulse rounded-xl bg-slate-50"><span className="sr-only">正在载入导入记录</span></div>}>
          <RecentImports courseId={courseId} />
        </Suspense>
      </div>
    </section>
  );
}
