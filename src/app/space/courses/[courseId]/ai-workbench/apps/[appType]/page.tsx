import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { getCourseAiAppDefinition, type CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "@/types/courseWorkspace";
import { AiAppGenerator } from "@/components/course-workspace/AiAppGenerator";
import { parseManagerAiArtifactDto } from "@/lib/courseWorkspace/aiArtifactClient";
import { PrepWorkflowNavigation, type PrepWorkflow } from "@/components/course-workspace/PrepWorkflowNavigation";
import { parseStoredDocumentSections } from "@/lib/imports/documentSections";

type PageProps = {
  params: Promise<{ courseId: string; appType: string }>;
  searchParams: Promise<{ sourceArtifactId?: string }>;
};

function parseAppType(value: string): CourseAiAppType | null {
  if (
    value === "question_generation"
    || value === "lesson_plan"
    || value === "courseware"
    || value === "paper_assembly"
    || value === "ppt_courseware"
    || value === "html_courseware"
  ) {
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
      description: "只从已确认教案生成可编辑、可确认的课堂课件。",
      workflow: "courseware",
      active: "courseware"
    };
  }
  if (appType === "ppt_courseware" || appType === "html_courseware") {
    return {
      title: appType === "ppt_courseware" ? "PPT课件" : "历史 HTML 课件",
      description: appType === "ppt_courseware"
        ? "将已确认的 AI课件生成可逐页编辑、保存版本并发布的 PPT。"
        : "历史 HTML 课件仅保留查看，不再生成新内容。",
      workflow: "courseware",
      active: "interactive"
    };
  }
  return fallback;
}

async function AiAppGeneratorContent({
  courseId,
  appType,
  app,
  preferredSourceId
}: {
  courseId: string;
  appType: CourseAiAppType;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
  preferredSourceId?: string;
}) {
  const needsCourseContent = app.prerequisites?.includes("course_content") ?? false;
  const [chapters, artifactRows, approvedQuestions, coursewareSources, documentRows, resourcePresence, importPresence] = await Promise.all([
    db.chapter.findMany({
      where: { courseId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, title: true }
    }),
    db.courseAiArtifact.findMany({
      where: { courseId, appType, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 20,
      select: {
        id: true,
        seriesId: true,
        appType: true,
        title: true,
        prompt: true,
        payload: true,
        publishedPayload: true,
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
        withdrawnAt: true,
        deletedAt: true,
        lockVersion: true,
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
    appType === "ppt_courseware" || appType === "courseware"
      ? db.courseAiArtifact.findMany({
          where: {
            courseId,
            appType: appType === "courseware" ? "lesson_plan" : "courseware",
            status: { in: ["APPROVED", "PUBLISHED"] },
            payload: { not: null },
            deletedAt: null
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: { id: true, title: true, version: true, status: true }
        })
      : Promise.resolve([]),
    appType === "lesson_plan"
      ? db.documentImportJob.findMany({
          where: {
            courseId,
            deletedAt: null,
            status: { in: ["READY_FOR_REVIEW", "APPLIED"] },
            extractedText: { not: null }
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 20,
          select: { id: true, originalName: true, parsedSections: true }
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
  const documentSources = documentRows.map((document) => ({
    id: document.id,
    title: document.originalName,
    sections: parseStoredDocumentSections(document.parsedSections).map((section) => ({
      id: section.id,
      title: section.title
    }))
  }));

  return (
    <AiAppGenerator
      courseId={courseId}
      app={app}
      chapters={chapters}
      approvedQuestions={approvedQuestions}
      coursewareSources={coursewareSources}
      documentSources={documentSources}
      preferredSourceId={preferredSourceId}
      initialArtifacts={initialArtifacts}
      hasCourseContent={hasCourseContent}
    />
  );
}

export default async function AiAppDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const [{ courseId, appType: rawAppType }, query] = await Promise.all([params, searchParams]);
  const appType = parseAppType(rawAppType);
  if (!appType) notFound();

  const appDefinition = getCourseAiAppDefinition(appType);
  if (!appDefinition.enabled || !appDefinition.appType) notFound();
  const app = { ...appDefinition, appType: appDefinition.appType };

  const course = await requireCourseManager(user, courseId);

  const presentation = pagePresentation(appType, { title: app.title, description: app.description });
  const generator = await AiAppGeneratorContent({ courseId: course.id, appType, app, preferredSourceId: query.sourceArtifactId });

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

      {generator}
    </div>
  );
}
