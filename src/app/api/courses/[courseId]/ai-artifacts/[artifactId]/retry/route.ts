import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import {
  AiGenerationInputError,
  canRetryAiGeneration,
  enqueueAiGenerationJob,
  getAiGenerationJobsAhead,
  parseAiGenerationInputSnapshot,
  safeAiArtifactSelect,
  toSafeAiArtifactDto
} from "@/lib/courseWorkspace/aiGenerationQueue";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json(
      { code: "FORBIDDEN", error: error instanceof Error ? error.message : "无权管理课程" },
      { status: 403 }
    );
  }

  const source = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId },
    select: { id: true, appType: true, status: true, inputSnapshot: true }
  });
  if (!source) {
    return NextResponse.json({ code: "AI_ARTIFACT_NOT_FOUND", error: "AI 产物不存在" }, { status: 404 });
  }
  if (!canRetryAiGeneration(source.status)) {
    return NextResponse.json(
      { code: "AI_ARTIFACT_NOT_RETRYABLE", error: "只有失败的 AI 任务可以重试" },
      { status: 409 }
    );
  }

  try {
    parseAiGenerationInputSnapshot(source.inputSnapshot, source.appType);
  } catch (error) {
    if (error instanceof AiGenerationInputError) {
      return NextResponse.json(
        { code: error.code, error: "AI 生成任务输入已损坏，请重新发起生成" },
        { status: 409 }
      );
    }
    throw error;
  }

  const transitioned = await db.courseAiArtifact.updateMany({
    where: { id: artifactId, courseId, status: "FAILED" },
    data: {
      status: "QUEUED",
      payload: null,
      runToken: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null
    }
  });
  if (transitioned.count !== 1) {
    return NextResponse.json(
      { code: "AI_ARTIFACT_NOT_RETRYABLE", error: "任务状态已变化，请刷新后重试" },
      { status: 409 }
    );
  }

  const artifact = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId },
    select: safeAiArtifactSelect
  });
  if (!artifact) {
    return NextResponse.json({ code: "AI_ARTIFACT_NOT_FOUND", error: "AI 产物不存在" }, { status: 404 });
  }

  enqueueAiGenerationJob(artifactId);
  return NextResponse.json({
    artifact: toSafeAiArtifactDto(artifact, {
      canManage: true,
      jobsAhead: getAiGenerationJobsAhead(artifactId)
    })
  }, { status: 202 });
}
