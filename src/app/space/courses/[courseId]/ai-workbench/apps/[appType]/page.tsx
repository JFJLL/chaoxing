import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";
import { getCourseAiAppDefinition, type CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "@/types/courseWorkspace";
import { AiAppGenerator } from "@/components/course-workspace/AiAppGenerator";
import { parseManagerAiArtifactDto } from "@/lib/courseWorkspace/aiArtifactClient";
import { PrepWorkflowNavigation, type PrepWorkflow } from "@/components/course-workspace/PrepWorkflowNavigation";

type PageProps = {
  params: Promise<{ courseId: string; appType: string }>;
};

function parseAppType(value: string): CourseAiAppType | null {
  if (value === "question_generation" || value === "lesson_plan" || value === "courseware" || value === "paper_assembly" || value === "html_courseware") {
    return value;
  }
  return null;
}

function pagePresentation(appType: CourseAiAppType, fallback: { title: string; description: string }): {
  title: string;
  description: string;
  workflow?: PrepWorkflow;
  active?: string;
} {
  if (appType === "question_generation") {
    return {
      title: "AI出题与组卷",
      description: "生成题目、审核入库，再使用已确认题目完成组卷。",
      workflow: "assessment",
      active: "questions"
    };
  }
  if (appType === "paper_assembly") {
    return {
      title: "AI出题与组卷",
      description: "生成题目、审核入库，再使用已确认题目完成组卷。",
      workflow: "assessment",
      active: "paper"
    };
  }
  if (appType === "courseware") {
    return {
      title: "AI课件",
      description: "从普通课件生成到互动发布，集中在同一条制作流程中。",
      workflow: "courseware",
      active: "courseware"
    };
  }
  if (appType === "html_courseware") {
    return {
      title: "AI课件",
      description: "从普通课件生成到互动发布，集中在同一条制作流程中。",
      workflow: "courseware",
      active: "interactive"
    };
  }
  return fallback;
}

async function AiAppGeneratorContent({
  courseId,
  appType,
  app
}: {
  courseId: string;
  appType: CourseAiAppType;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
}) {
  const needsCourseContent = app.prerequisites?.includes("course_content") ?? false;
  const [chapters, artifactRows, approvedQuestions, coursewareSources, resourcePresence, importPresence] = await Promise.all([
    db.chapter.findMany({
      where: { courseId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, title: true }
    }),
    db.courseAiArtifact.findMany({
      where: { courseId, appType },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 20,
      select: {
        id: true,
        seriesId: true,
        appType: true,
        title: true,
        prompt: true,
        payload: true,
        scope: true,
        status: true,
        version: true,
        errorCode: true,
        errorMessage: true,
        sourceJobId: true,
        sourceArtifactId: true,
        startedAt: true,
        finishedAt: true,
        approvedAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    appType === "paper_assembly"
      ? db.courseQuestion.findMany({
          where: { courseId, status: "APPROVED" },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: { id: true, stem: true }
        })
      : Promise.resolve([]),
    appType === "html_courseware"
      ? db.courseAiArtifact.findMany({
          where: {
            courseId,
            appType: "courseware",
            status: { in: ["APPROVED", "PUBLISHED"] },
            payload: { not: null }
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: { id: true, title: true, version: true, status: true }
        })
      : Promise.resolve([]),
    needsCourseContent
      ? db.resource.findFirst({ where: { courseId }, select: { id: true } })
      : Promise.resolve(null),
    needsCourseContent
      ? db.documentImportJob.findFirst({ where: { courseId, extractedText: { not: null } }, select: { id: true } })
      : Promise.resolve(null)
  ]);

  const initialArtifacts = artifactRows.map((artifact) => parseManagerAiArtifactDto({
    ...artifact,
    appType,
    jobsAhead: null,
    startedAt: artifact.startedAt?.toISOString() ?? null,
    finishedAt: artifact.finishedAt?.toISOString() ?? null,
    approvedAt: artifact.approvedAt?.toISOString() ?? null,
    publishedAt: artifact.publishedAt?.toISOString() ?? null,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString()
  }));
  const hasCourseContent = !needsCourseContent || chapters.length > 0 || Boolean(resourcePresence) || Boolean(importPresence);

  return (
    <AiAppGenerator
      courseId={courseId}
      app={app}
      chapters={chapters}
      approvedQuestions={approvedQuestions}
      coursewareSources={coursewareSources}
      initialArtifacts={initialArtifacts}
      hasCourseContent={hasCourseContent}
    />
  );
}

function AiAppGeneratorLoading() {
  return (
    <div role="status" aria-label="正在载入 AI 任务" className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="h-[420px] animate-pulse rounded-2xl bg-white shadow-sm" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-white shadow-sm" />
      <span className="sr-only">正在载入 AI 任务</span>
    </div>
  );
}

export default async function AiAppDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, appType: rawAppType } = await params;
  const appType = parseAppType(rawAppType);
  if (!appType) notFound();

  const appDefinition = getCourseAiAppDefinition(appType);
  if (!appDefinition.enabled || !appDefinition.appType) notFound();
  const app = { ...appDefinition, appType: appDefinition.appType };

  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  if (!canManage) redirect(`/space/courses/${course.id}/resources`);

  const presentation = pagePresentation(appType, { title: app.title, description: app.description });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 rounded-[28px] bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{presentation.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{presentation.description}</p>
        </div>
        {presentation.workflow && presentation.active ? (
          <PrepWorkflowNavigation courseId={course.id} workflow={presentation.workflow} active={presentation.active} />
        ) : null}
      </div>

      <Suspense fallback={<AiAppGeneratorLoading />}>
        <AiAppGeneratorContent courseId={course.id} appType={appType} app={app} />
      </Suspense>
    </div>
  );
}
