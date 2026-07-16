import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { ImportProgressClient } from "@/components/ai-import/ImportProgressClient";
import { OutlineReviewEditor } from "@/components/ai-import/OutlineReviewEditor";
import { ImportJobManager } from "@/components/ai-import/ImportJobManager";
import type { GeneratedCourseOutline } from "@/types/course";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = {
  params: Promise<{ courseId: string; jobId: string }>;
};

export default async function AiImportReviewPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, jobId } = await params;
  await requireCourseOwner(user, courseId);
  const job = await db.documentImportJob.findFirst({
    where: { id: jobId, courseId },
    include: {
      course: true,
      knowledgeMaps: {
        orderBy: { updatedAt: "desc" },
        include: { nodes: true, edges: true }
      },
      aiArtifacts: {
        where: { appType: "html_courseware" },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!job) notFound();
  const outline = job.generatedOutline ? (JSON.parse(job.generatedOutline) as GeneratedCourseOutline) : null;
  const latestMap = job.knowledgeMaps[0];
  const latestHtmlArtifact = job.aiArtifacts[0];

  return (
    <FanyaCourseShell user={user} course={job.course} activeTab="ai-workbench">
      <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
        <div className="space-y-6">
          <header className="border-b border-[var(--cx-border)] pb-5">
            <CourseWorkspaceBreadcrumbs
              courseId={courseId}
              courseTitle={job.course.title}
              current={job.originalName}
              intermediate={[{ label: "AI文档建课", href: `/space/courses/${courseId}/ai-import` }]}
            />
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">AI文档建课</h1>
            <p className="mt-1 text-sm text-slate-500">{job.originalName}</p>
          </header>
          <ImportProgressClient
            jobId={job.id}
            initialStatus={job.status}
            initialCurrentStage={job.currentStage}
            initialJobsAhead={null}
            initialErrorMessage={job.errorMessage}
            retryHref={`/space/courses/${courseId}/ai-import`}
          />
          {job.warning ? <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-700">{job.warning}</p> : null}
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
            htmlArtifact={
              latestHtmlArtifact
                ? {
                    id: latestHtmlArtifact.id,
                    title: latestHtmlArtifact.title,
                    status: latestHtmlArtifact.status,
                    createdAt: latestHtmlArtifact.createdAt.toISOString(),
                    publishedAt: latestHtmlArtifact.publishedAt?.toISOString() ?? null
                  }
                : null
            }
          />
          {outline ? <OutlineReviewEditor jobId={job.id} courseId={courseId} initialOutline={outline} /> : null}
        </div>
      </section>
    </FanyaCourseShell>
  );
}
