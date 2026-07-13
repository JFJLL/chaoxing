import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import {
  getAiGenerationJobsAhead,
  recoverAiGenerationJobFromDatabase,
  safeAiArtifactSelect,
  toSafeAiArtifactDto
} from "@/lib/courseWorkspace/aiGenerationQueue";
import { createArtifactRevision, ArtifactRevisionError } from "@/lib/courseWorkspace/artifactRevision";
import { ArtifactPayloadError, parseArtifactEditBody } from "@/lib/courseWorkspace/artifactPayload";
import { createPrismaArtifactRevisionStore } from "@/lib/courseWorkspace/prismaArtifactStores";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  if (canManage) await recoverAiGenerationJobFromDatabase(courseId, artifactId);
  const artifact = await db.courseAiArtifact.findFirst({
    where: {
      id: artifactId,
      courseId,
      ...(canManage ? {} : { status: "PUBLISHED" })
    },
    select: safeAiArtifactSelect
  });
  if (!artifact) {
    return NextResponse.json({ code: "AI_ARTIFACT_NOT_FOUND", error: "AI 产物不存在" }, { status: 404 });
  }

  return NextResponse.json({
    artifact: toSafeAiArtifactDto(artifact, {
      canManage,
      jobsAhead: getAiGenerationJobsAhead(artifact.id)
    })
  });
}

const editErrorMessages: Record<string, string> = {
  ARTIFACT_EDIT_BODY_INVALID: "编辑内容格式无效",
  ARTIFACT_PAYLOAD_INVALID: "编辑内容不符合该 AI 应用的数据格式",
  ARTIFACT_APP_TYPE_INVALID: "不支持的 AI 产物类型",
  ARTIFACT_HTML_EDIT_FORBIDDEN: "HTML 课件不支持手工编辑，请从已确认课件重新生成视觉版本",
  ARTIFACT_QUESTION_ID_INVALID: "题目标识无效或重复，请刷新草稿后重试",
  ARTIFACT_SOURCE_NOT_FOUND: "AI 产物不存在",
  ARTIFACT_PAYLOAD_REQUIRED: "编辑内容不能为空",
  ARTIFACT_SOURCE_NOT_EDITABLE: "当前 AI 产物不能创建新版本",
  ARTIFACT_REVISION_CONFLICT: "版本已被其他操作更新，请重试"
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const source = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId },
    select: { appType: true, payload: true }
  });
  if (!source) {
    return NextResponse.json({ code: "ARTIFACT_SOURCE_NOT_FOUND", error: "AI 产物不存在" }, { status: 404 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ArtifactPayloadError("ARTIFACT_EDIT_BODY_INVALID");
    }
    const edit = parseArtifactEditBody(source.appType, body, { sourcePayload: source.payload });
    const artifact = await createArtifactRevision(createPrismaArtifactRevisionStore(), {
      courseId,
      sourceArtifactId: artifactId,
      userId: user.id,
      ...edit
    });
    return NextResponse.json({ artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null }) }, { status: 201 });
  } catch (error) {
    if (error instanceof ArtifactPayloadError || error instanceof ArtifactRevisionError) {
      const retryable = error instanceof ArtifactRevisionError ? error.retryable : false;
      const status = error.code === "ARTIFACT_SOURCE_NOT_FOUND" ? 404 : retryable ? 409 : 400;
      return NextResponse.json({
        code: error.code,
        error: editErrorMessages[error.code] ?? "无法保存 AI 产物版本",
        retryable
      }, { status });
    }
    throw error;
  }
}
