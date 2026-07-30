import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { AiServiceError } from "@/lib/ai/errors";
import { aiLessonPlanPayloadSchema } from "@/types/courseWorkspace";
import { recommendCoursewareSlideCount } from "@/lib/courseWorkspace/recommendSlideCount";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const bodySchema = z.object({
  sourceArtifactId: z.string().trim().min(1).max(200)
}).strict();

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;

  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ code: "FORBIDDEN", error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "推荐参数无效" }, { status: 400 });
  }

  // Scope the lookup to this course so another course's artifact ID resolves to
  // a 404 instead of leaking or using cross-course content.
  const source = await db.courseAiArtifact.findFirst({
    where: { id: parsed.data.sourceArtifactId, courseId, deletedAt: null },
    select: { id: true, appType: true, status: true, version: true, payload: true, title: true }
  });
  if (!source) {
    return NextResponse.json({ code: "AI_SOURCE_NOT_FOUND", error: "来源教案不存在" }, { status: 404 });
  }
  if (source.appType !== "lesson_plan") {
    return NextResponse.json({ code: "AI_SOURCE_INVALID", error: "来源必须是 AI 教案，AI课件或 PPT 不能作为页数推荐来源" }, { status: 409 });
  }
  if (source.status !== "APPROVED") {
    return NextResponse.json({ code: "AI_SOURCE_NOT_APPROVED", error: "来源教案尚未确认，无法推荐页数" }, { status: 409 });
  }

  let lessonPlan;
  try {
    lessonPlan = aiLessonPlanPayloadSchema.parse(JSON.parse(source.payload ?? "null"));
  } catch {
    return NextResponse.json({ code: "AI_SOURCE_INVALID", error: "来源教案内容无效，无法推荐页数" }, { status: 409 });
  }

  try {
    const recommendation = await recommendCoursewareSlideCount({ title: source.title, lessonPlan });
    return NextResponse.json({
      recommendedSlideCount: recommendation.recommendedSlideCount,
      reason: recommendation.reason,
      sourceArtifactId: source.id,
      sourceArtifactVersion: source.version
    });
  } catch (error) {
    const code = error instanceof AiServiceError ? error.code : "AI_RECOMMENDATION_FAILED";
    const message = error instanceof AiServiceError ? error.message : "AI 页数建议暂不可用";
    return NextResponse.json({ code, error: message }, { status: 502 });
  }
}
