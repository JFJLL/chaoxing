import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { ImportProgressClient } from "@/components/ai-import/ImportProgressClient";
import { OutlineReviewEditor } from "@/components/ai-import/OutlineReviewEditor";
import { ImportJobManager } from "@/components/ai-import/ImportJobManager";
import type { CourseDirectoryNode, GeneratedCourseOutline } from "@/types/course";
import { mapImportedOutlineToCourse } from "@/lib/imports/mapImportedOutlineToCourse";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { isImportReviewReady } from "@/lib/imports/importProgress";

type PageProps = {
  params: Promise<{ courseId: string; jobId: string }>;
};

function splitList(value?: string | null) {
  return (value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

export default async function AiImportReviewPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, jobId } = await params;
  await requireCourseManager(user, courseId);
  const job = await db.documentImportJob.findFirst({
    where: { id: jobId, courseId, deletedAt: null },
    include: {
      course: true,
      batch: {
        include: {
          documents: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, originalName: true, status: true }
          }
        }
      },
      knowledgeMaps: {
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: { updatedAt: "desc" },
        include: { nodes: true, edges: true }
      }
    }
  });

  if (!job) notFound();
  const storedOutline = job.batch ? job.batch.generatedOutline : job.generatedOutline;
  const outline = storedOutline ? (JSON.parse(storedOutline) as GeneratedCourseOutline) : null;
  const latestMap = job.knowledgeMaps[0];
  const reviewReady = isImportReviewReady({
    status: job.status,
    hasOutline: Boolean(outline),
    hasKnowledgeMap: Boolean(latestMap),
    batchStatus: job.batch?.status
  });
  const batchIsCombining = Boolean(job.batch && !["READY_FOR_REVIEW", "APPLIED", "FAILED"].includes(job.batch.status));

  const existingChapters = await db.chapter.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } }
  });
  const currentDirectory: CourseDirectoryNode[] = existingChapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary ?? "",
    order: chapter.order,
    lessons: chapter.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary ?? "",
      order: lesson.order,
      estimatedMinutes: lesson.estimatedMinutes ?? 30,
      keyPoints: splitList(lesson.keyPoints),
      suggestedActivities: splitList(lesson.activities),
      assessmentPrompts: splitList(lesson.assessments)
    }))
  }));
  // Bind existing chapter/lesson IDs before the teacher edits titles, so that
  // matched items keep their real IDs (and their resource/progress links)
  // instead of being recreated on save.
  const mapped = outline ? mapImportedOutlineToCourse(currentDirectory, outline) : null;

  return (
    <FanyaCourseShell user={user} course={job.course} activeTab="ai-workbench">
      <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
        <div className="space-y-6">
          <header className="border-b border-[var(--cx-border)] pb-5">
            <h1 className="text-2xl font-semibold text-slate-900">审核综合课程目录</h1>
            <p className="mt-1 text-sm text-slate-500">本批次会把多份资料综合成一份目录，每份资料仍保留独立章节与知识图谱。</p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {(job.batch?.documents ?? [{ id: job.id, originalName: job.originalName, status: job.status }]).map((document) => (
                <li key={document.id} className="rounded-full bg-slate-100 px-3 py-1">资料：{document.originalName} · {document.status}</li>
              ))}
            </ul>
          </header>
          <ImportProgressClient
            jobId={job.id}
            initialStatus={job.status}
            initialCurrentStage={job.currentStage}
            initialJobsAhead={null}
            initialErrorMessage={job.errorMessage}
            initialReviewReady={reviewReady}
            retryHref={`/space/courses/${courseId}/ai-import`}
          />
          {job.warning ? <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-700">{job.warning}</p> : null}
          {batchIsCombining ? <p id="outline-review" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">正在综合分析多份资料</p> : null}
          {job.batch?.status === "FAILED" ? <p id="outline-review" role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">本批次存在失败资料，无法保存综合课程目录。请修复失败资料后重新导入。</p> : null}
          <ImportJobManager
            courseId={courseId}
            jobId={job.id}
            status={job.status}
            map={
              latestMap
                ? {
                    id: latestMap.id,
                    title: latestMap.title,
                    summary: latestMap.summary,
                    status: latestMap.status,
                    nodes: latestMap.nodes.map((node) => ({ id: node.id, label: node.label, type: node.type })),
                    edges: latestMap.edges.map((edge) => ({ id: edge.id, type: edge.type }))
                  }
                : null
            }
          />
          {outline && mapped && job.batch?.status === "READY_FOR_REVIEW" ? (
            <OutlineReviewEditor
              jobId={job.id}
              courseId={courseId}
              initialOutline={mapped.outline}
              initialOutlineVersion={job.course.outlineVersion}
              initialBatchVersion={job.batch.generatedOutlineVersion}
              hasExistingDirectory={currentDirectory.length > 0}
              ambiguousTitles={mapped.ambiguousTitles}
            />
          ) : null}
          {job.status === "APPLIED" || job.batch?.status === "APPLIED" ? (
            <p id="outline-review" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">课程目录已保存。目录现为只读状态，请前往课程目录查看；需要调整时点击右上角“编辑”。</p>
          ) : null}
        </div>
      </section>
    </FanyaCourseShell>
  );
}
