import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireCourseOwner } from "@/lib/permissions";
import { ArtifactWorkflowError, publishArtifact } from "@/lib/courseWorkspace/artifactWorkflow";
import { createPrismaArtifactWorkflowStore } from "@/lib/courseWorkspace/prismaArtifactStores";
import { toSafeAiArtifactDto } from "@/lib/courseWorkspace/aiGenerationQueue";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string }> };

const messages: Record<string, string> = {
  ARTIFACT_NOT_FOUND: "AI 产物不存在",
  AI_ARTIFACT_TYPE_NOT_PUBLISHABLE: "该 AI 产物仅供教师内部使用，确认后无需发布",
  ARTIFACT_PUBLISH_CONFLICT: "只有已确认且状态未变化的 AI 产物可以发布"
};

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null) as { lockVersion?: unknown } | null;
    if (!body || !Number.isInteger(body.lockVersion) || Number(body.lockVersion) < 0) {
      return NextResponse.json({ code: "INVALID_REQUEST", error: "发布参数无效" }, { status: 400 });
    }
    const artifact = await publishArtifact(createPrismaArtifactWorkflowStore(), {
      courseId,
      artifactId,
      expectedLockVersion: Number(body.lockVersion)
    });
    return NextResponse.json({ artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null }) });
  } catch (error) {
    if (error instanceof ArtifactWorkflowError) {
      return NextResponse.json({
        code: error.code,
        error: messages[error.code] ?? "无法发布 AI 产物",
        retryable: error.retryable
      }, { status: error.code === "ARTIFACT_NOT_FOUND" ? 404 : 409 });
    }
    throw error;
  }
}
