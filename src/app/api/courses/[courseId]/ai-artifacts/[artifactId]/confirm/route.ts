import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireCourseOwner } from "@/lib/permissions";
import { confirmArtifact, ArtifactWorkflowError } from "@/lib/courseWorkspace/artifactWorkflow";
import { ArtifactPayloadError } from "@/lib/courseWorkspace/artifactPayload";
import { createPrismaArtifactWorkflowStore } from "@/lib/courseWorkspace/prismaArtifactStores";
import { toSafeAiArtifactDto } from "@/lib/courseWorkspace/aiGenerationQueue";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string }> };

const messages: Record<string, string> = {
  ARTIFACT_NOT_FOUND: "AI 产物不存在",
  ARTIFACT_NOT_CONFIRMABLE: "只有内容完整的草稿可以确认",
  ARTIFACT_CONFIRM_CONFLICT: "产物状态已变化，请刷新后重试",
  DUPLICATE_QUESTION_SOURCE_KEY: "题目来源标识重复，请修改后重试",
  QUESTION_BANK_INSUFFICIENT: "试卷包含不存在、跨课程或尚未审核的题目，请先完善题库",
  INVALID_PAPER_QUESTIONS: "试卷中存在重复或无效的题目引用",
  INVALID_HTML_COURSEWARE_SOURCE: "HTML 课件必须来源于本课程已确认的课件",
  ARTIFACT_PAYLOAD_INVALID: "AI 产物内容格式无效，请编辑后重试"
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  try {
    const artifact = await confirmArtifact(createPrismaArtifactWorkflowStore(), {
      courseId,
      artifactId,
      userId: user.id
    });
    return NextResponse.json({ artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null }) });
  } catch (error) {
    if (error instanceof ArtifactWorkflowError || error instanceof ArtifactPayloadError) {
      const status = error.code === "ARTIFACT_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({
        code: error.code,
        error: messages[error.code] ?? "无法确认 AI 产物",
        retryable: "retryable" in error ? error.retryable : false
      }, { status });
    }
    throw error;
  }
}
