import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "@/types/courseWorkspace";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiAppGenerator } from "@/components/course-workspace/AiAppGenerator";
import { parseManagerAiArtifactDto } from "@/lib/courseWorkspace/aiArtifactClient";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = {
  params: Promise<{ courseId: string; appType: string }>;
};

function parseAppType(value: string): CourseAiAppType | null {
  if (value === "question_generation" || value === "lesson_plan" || value === "courseware" || value === "paper_assembly" || value === "html_courseware") {
    return value;
  }
  return null;
}

export default async function AiAppDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, appType: rawAppType } = await params;
  const appType = parseAppType(rawAppType);
  if (!appType) notFound();

  const appDefinition = getCourseAiAppDefinition(appType);
  if (!appDefinition.enabled || !appDefinition.appType) notFound();
  const app = { ...appDefinition, appType: appDefinition.appType };

  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  if (!canManage) redirect(`/space/courses/${course.id}/resources`);

  const artifacts = course.aiArtifacts.filter((artifact) => artifact.appType === appType);
  const initialArtifacts = artifacts.map((artifact) => parseManagerAiArtifactDto({
    id: artifact.id,
    seriesId: artifact.seriesId,
    appType,
    title: artifact.title,
    prompt: artifact.prompt,
    payload: artifact.payload,
    scope: artifact.scope,
    status: artifact.status,
    version: artifact.version,
    errorCode: artifact.errorCode,
    errorMessage: artifact.errorMessage,
    sourceJobId: artifact.sourceJobId,
    sourceArtifactId: artifact.sourceArtifactId,
    jobsAhead: null,
    startedAt: artifact.startedAt?.toISOString() ?? null,
    finishedAt: artifact.finishedAt?.toISOString() ?? null,
    approvedAt: artifact.approvedAt?.toISOString() ?? null,
    publishedAt: artifact.publishedAt?.toISOString() ?? null,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString()
  }));
  const approvedQuestions = appType === "paper_assembly"
    ? await db.courseQuestion.findMany({
        where: { courseId: course.id, status: "APPROVED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, stem: true }
      })
    : [];
  const coursewareSources = appType === "html_courseware"
    ? await db.courseAiArtifact.findMany({
        where: {
          courseId: course.id,
          appType: "courseware",
          status: { in: ["APPROVED", "PUBLISHED"] },
          payload: { not: null }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, title: true, version: true, status: true }
      })
    : [];
  const hasCourseContent = course.chapters.length > 0
    || course.resources.length > 0
    || await db.documentImportJob.count({ where: { courseId: course.id, extractedText: { not: null } } }) > 0;

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-[28px] bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current={app.title} />
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">{app.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{app.description}</p>
          </div>
        </div>

        <AiAppGenerator
          courseId={course.id}
          app={app}
          chapters={course.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title }))}
          approvedQuestions={approvedQuestions}
          coursewareSources={coursewareSources}
          initialArtifacts={initialArtifacts}
          hasCourseContent={hasCourseContent}
        />
      </div>
    </FanyaCourseShell>
  );
}
