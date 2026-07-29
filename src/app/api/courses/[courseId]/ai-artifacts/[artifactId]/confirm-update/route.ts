import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import {
  ArtifactWorkflowError,
  confirmArtifactUpdate
} from "@/lib/courseWorkspace/artifactWorkflow";
import { createPrismaArtifactWorkflowStore } from "@/lib/courseWorkspace/prismaArtifactStores";
import { toSafeAiArtifactDto } from "@/lib/courseWorkspace/aiGenerationQueue";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { lockVersion?: unknown } | null;
  if (!body || !Number.isInteger(body.lockVersion) || Number(body.lockVersion) < 0) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "更新参数无效" }, { status: 400 });
  }

  try {
    const artifact = await confirmArtifactUpdate(createPrismaArtifactWorkflowStore(), {
      courseId,
      artifactId,
      userId: user.id,
      expectedLockVersion: Number(body.lockVersion)
    });
    return NextResponse.json({
      artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null })
    });
  } catch (error) {
    if (error instanceof ArtifactWorkflowError) {
      const messages: Record<string, string> = {
        ARTIFACT_NOT_FOUND: "AI 产物不存在",
        ARTIFACT_UPDATE_NOT_PENDING: "当前没有等待发布的修改",
        ARTIFACT_CONFIRM_CONFLICT: "内容已被其他操作更新，请刷新后重试",
        QUESTION_BANK_INSUFFICIENT: "试卷中包含无效或未审核题目",
        INVALID_PAPER_QUESTIONS: "试卷中存在重复题目"
      };
      return NextResponse.json({
        code: error.code,
        error: messages[error.code] ?? "无法确认更新",
        retryable: error.retryable
      }, { status: error.code === "ARTIFACT_NOT_FOUND" ? 404 : 409 });
    }
    throw error;
  }
}
