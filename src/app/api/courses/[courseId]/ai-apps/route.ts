import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import { enabledCourseAiAppTypes, getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { generationRequestGuard } from "@/lib/ai/generationRequestGuard";
import { BoundedJsonBodyError, readBoundedJsonBody } from "@/lib/ai/requestGuards";
import {
  AiContextTooLargeError,
  InvalidAiScopeError,
  aiContextScopeSchema,
  buildCourseAiContext
} from "@/lib/courseWorkspace/buildAiContext";
import {
  acquireAiGenerationBacklogReservation,
  enqueueAiGenerationJob,
  getAiGenerationJobsAhead,
  recoverAiGenerationJobsFromDatabase,
  safeAiArtifactSelect,
  serializeAiGenerationInput,
  toSafeAiArtifactDto
} from "@/lib/courseWorkspace/aiGenerationQueue";
import { parseAiGenerationInputSnapshot } from "@/lib/courseWorkspace/aiGenerationQueue";
import { aiCoursewarePayloadSchema, aiLessonPlanPayloadSchema } from "@/types/courseWorkspace";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const appTypeSchema = z.enum([
  "question_generation",
  "lesson_plan",
  "courseware",
  "paper_assembly",
  "ppt_courseware",
  "html_courseware"
]);

const createArtifactSchema = z.object({
  appType: appTypeSchema,
  title: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().max(4_000).optional(),
  scope: aiContextScopeSchema.optional(),
  sourceArtifactId: z.string().trim().min(1).max(200).optional(),
  sourceSelections: z.array(z.object({
    documentId: z.string().trim().min(1).max(200),
    sectionIds: z.array(z.string().trim().min(1).max(200)).max(100)
  }).strict()).min(1).max(20).optional()
}).strict();

const MAX_GENERATION_BODY_BYTES = 16_384;

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  const appType = request.nextUrl.searchParams.get("appType");
  const parsedAppType = appType ? appTypeSchema.safeParse(appType) : null;
  if (appType && !parsedAppType?.success) {
    return NextResponse.json({ error: "AI 应用类型无效" }, { status: 400 });
  }

  if (canManage) await recoverAiGenerationJobsFromDatabase();

  const artifacts = await db.courseAiArtifact.findMany({
    where: {
      courseId,
      deletedAt: null,
      ...(canManage ? {} : { status: "PUBLISHED" }),
      ...(parsedAppType?.success ? { appType: parsedAppType.data } : {})
    },
    orderBy: { createdAt: "desc" },
    select: safeAiArtifactSelect
  });

  return NextResponse.json({
    artifacts: artifacts.map((artifact) => toSafeAiArtifactDto(artifact, {
      canManage,
      jobsAhead: getAiGenerationJobsAhead(artifact.id)
    }))
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;

  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json(
      { code: "FORBIDDEN", error: error instanceof Error ? error.message : "无权管理课程" },
      { status: 403 }
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await readBoundedJsonBody(request, MAX_GENERATION_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonBodyError && error.reason === "too_large") {
      return NextResponse.json({
        code: "AI_GENERATION_BODY_TOO_LARGE",
        error: "AI 生成请求内容过大",
        retryable: false
      }, { status: 413 });
    }
    return NextResponse.json({ code: "INVALID_REQUEST", error: "生成参数无效" }, { status: 400 });
  }
  if (requestBody && typeof requestBody === "object" && "scope" in requestBody) {
    const parsedScope = aiContextScopeSchema.safeParse((requestBody as { scope?: unknown }).scope);
    if (!parsedScope.success) {
      return NextResponse.json({ code: "INVALID_AI_SCOPE", error: "所选课程范围无效" }, { status: 400 });
    }
  }
  const parsed = createArtifactSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "生成参数无效" }, { status: 400 });
  }

  if (parsed.data.appType === "html_courseware") {
    return NextResponse.json({
      code: "HTML_COURSEWARE_RETIRED",
      error: "HTML 互动课件已停止生成，请使用 PPT 课件"
    }, { status: 410 });
  }

  if (!enabledCourseAiAppTypes.includes(parsed.data.appType)) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "该 AI 应用暂未复刻" }, { status: 400 });
  }

  const needsArtifactSource = parsed.data.appType === "courseware" || parsed.data.appType === "ppt_courseware";
  if (needsArtifactSource !== Boolean(parsed.data.sourceArtifactId)) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "生成参数无效" }, { status: 400 });
  }
  if ((parsed.data.appType === "lesson_plan") !== Boolean(parsed.data.sourceSelections?.length)) {
    return NextResponse.json({ code: "AI_PREREQUISITE_REQUIRED", error: "AI教案必须选择至少一份资料或资料章节" }, { status: 409 });
  }

  const requestLease = generationRequestGuard.acquire(`${user.id}:${courseId}`);
  if (!requestLease.allowed) {
    return NextResponse.json({
      code: "AI_GENERATION_RATE_LIMITED",
      error: "AI 生成请求过于频繁，请稍后重试",
      retryable: true
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(requestLease.retryAfterMs / 1_000))) }
    });
  }

  try {
    const app = getCourseAiAppDefinition(parsed.data.appType);
    const scope = parsed.data.scope ?? { kind: "course" as const };
    let artifactInput;
    let sourceArtifactId: string | null = null;

    if (parsed.data.appType === "lesson_plan") {
      const course = await db.course.findUnique({ where: { id: courseId }, select: { outlineVersion: true } });
      const selections = parsed.data.sourceSelections!;
      const documents = await db.documentImportJob.findMany({
        where: {
          courseId,
          id: { in: selections.map((selection) => selection.documentId) },
          deletedAt: null,
          status: { in: ["READY_FOR_REVIEW", "APPLIED"] },
          generatedOutline: { not: null },
          extractedText: { not: null }
        },
        select: { id: true, generatedOutline: true }
      });
      if (!course || documents.length !== new Set(selections.map((selection) => selection.documentId)).size) {
        return NextResponse.json({ code: "INVALID_AI_SCOPE", error: "所选资料已失效，请重新选择" }, { status: 400 });
      }
      for (const selection of selections) {
        if (!selection.sectionIds.length) continue;
        const document = documents.find((item) => item.id === selection.documentId)!;
        const outline = JSON.parse(document.generatedOutline!) as { chapters?: Array<{ order?: number }> };
        const validIds = new Set((outline.chapters ?? []).map((chapter, index) => `chapter-${chapter.order ?? index + 1}`));
        if (selection.sectionIds.some((id) => !validIds.has(id))) {
          return NextResponse.json({ code: "INVALID_AI_SCOPE", error: "所选资料章节已失效，请重新选择" }, { status: 400 });
        }
      }
      const sourceSnapshot = { outlineVersion: course.outlineVersion, documents: selections };
      const aiContext = await buildCourseAiContext({
        courseId,
        scope,
        prompt: parsed.data.prompt,
        sourceSelections: selections
      });
      artifactInput = { appType: "lesson_plan", context: aiContext, sourceSnapshot } as const;
    } else if (parsed.data.appType === "courseware") {
      const source = await db.courseAiArtifact.findFirst({
        where: { id: parsed.data.sourceArtifactId!, courseId, appType: "lesson_plan", status: "APPROVED", deletedAt: null },
        select: { id: true, version: true, payload: true, inputSnapshot: true }
      });
      let sourceLessonPlan;
      let sourceInput;
      try {
        sourceLessonPlan = source?.payload ? aiLessonPlanPayloadSchema.parse(JSON.parse(source.payload)) : null;
        sourceInput = source ? parseAiGenerationInputSnapshot(source.inputSnapshot, "lesson_plan") : null;
      } catch {
        sourceLessonPlan = null;
        sourceInput = null;
      }
      if (!source || !sourceLessonPlan || !sourceInput?.context) {
        return NextResponse.json({ code: "AI_PREREQUISITE_REQUIRED", error: "AI课件只能从已确认教案生成" }, { status: 409 });
      }
      sourceArtifactId = source.id;
      artifactInput = {
        appType: "courseware",
        context: sourceInput.context,
        sourceLessonPlan,
        sourceSnapshot: {
          sourceArtifactId: source.id,
          sourceArtifactVersion: source.version,
          sourceInputSnapshot: source.inputSnapshot
        }
      } as const;
    } else if (parsed.data.appType === "paper_assembly") {
      const approvedRows = await db.courseQuestion.findMany({
        where: { courseId, status: "APPROVED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 500,
        select: { id: true, type: true, stem: true }
      });
      if (approvedRows.length < 3) {
        return NextResponse.json({
          code: "QUESTION_BANK_INSUFFICIENT",
          error: "已审核题目不足，请先生成并审核至少 3 道题目"
        }, { status: 409 });
      }
      const approvedQuestions = approvedRows.map((question) => ({
        id: question.id,
        type: z.enum(["single_choice", "multiple_choice", "short_answer"]).parse(question.type),
        stem: question.stem
      }));
      const aiContext = await buildCourseAiContext({ courseId, scope, prompt: parsed.data.prompt });
      artifactInput = { appType: parsed.data.appType, context: aiContext, approvedQuestions } as const;
    } else if (parsed.data.appType === "ppt_courseware") {
      const source = await db.courseAiArtifact.findFirst({
        where: { id: parsed.data.sourceArtifactId!, courseId },
        select: { id: true, appType: true, status: true, payload: true }
      });
      let sourceCourseware;
      try {
        sourceCourseware = source?.payload ? aiCoursewarePayloadSchema.parse(JSON.parse(source.payload)) : null;
      } catch {
        sourceCourseware = null;
      }
      if (!source || source.appType !== "courseware" || !["APPROVED", "PUBLISHED"].includes(source.status) || !sourceCourseware) {
        return NextResponse.json({
          code: "AI_PREREQUISITE_REQUIRED",
          error: "请先生成并确认 AI 课件后再生成 PPT 课件"
        }, { status: 409 });
      }
      sourceArtifactId = source.id;
      const artifact = await db.courseAiArtifact.create({
        data: {
          courseId,
          userId: user.id,
          appType: "ppt_courseware",
          title: parsed.data.title ?? `${app.title} ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
          prompt: parsed.data.prompt,
          payload: JSON.stringify(sourceCourseware),
          inputSnapshot: null,
          runToken: null,
          scope: null,
          sourceArtifactId,
          status: "APPROVED",
          version: 1,
          approvedAt: new Date(),
          finishedAt: new Date()
        },
        select: safeAiArtifactSelect
      });
      return NextResponse.json({
        artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null })
      }, { status: 201 });
    } else {
      const aiContext = await buildCourseAiContext({ courseId, scope, prompt: parsed.data.prompt });
      artifactInput = { appType: parsed.data.appType, context: aiContext } as const;
    }

    const backlogReservation = await acquireAiGenerationBacklogReservation({ courseId, userId: user.id });
    if (!backlogReservation.allowed) {
      const globalCapacity = backlogReservation.reason === "global";
      return NextResponse.json({
        code: globalCapacity ? "AI_GENERATION_CAPACITY_REACHED" : "AI_GENERATION_BACKLOG_LIMITED",
        error: globalCapacity ? "AI 生成队列已满，请稍后重试" : "当前课程或用户的 AI 生成任务过多，请稍后重试",
        retryable: true
      }, { status: globalCapacity ? 503 : 429 });
    }
    let artifact;
    try {
      artifact = await db.courseAiArtifact.create({
        data: {
          courseId,
          userId: user.id,
          appType: parsed.data.appType,
          title: parsed.data.title ?? `${app.title} ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
          prompt: parsed.data.prompt,
          payload: null,
          inputSnapshot: serializeAiGenerationInput(artifactInput),
          runToken: null,
          scope: JSON.stringify(scope),
          sourceArtifactId,
          status: "QUEUED",
          version: 1
        },
        select: safeAiArtifactSelect
      });
    } finally {
      await backlogReservation.release();
    }
    enqueueAiGenerationJob(artifact.id);

    return NextResponse.json({
      artifact: toSafeAiArtifactDto(artifact, {
        canManage: true,
        jobsAhead: getAiGenerationJobsAhead(artifact.id)
      })
    }, { status: 202 });
  } catch (error) {
    if (error instanceof AiContextTooLargeError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 413 });
    }
    if (error instanceof InvalidAiScopeError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { code: "AI_GENERATION_ENQUEUE_FAILED", error: "AI 生成任务创建失败，请重试" },
      { status: 500 }
    );
  } finally {
    requestLease.release();
  }
}
