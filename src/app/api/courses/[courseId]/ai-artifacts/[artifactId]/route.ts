import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import {
  getAiGenerationJobsAhead,
  recoverAiGenerationJobFromDatabase,
  safeAiArtifactSelect,
  toSafeAiArtifactDto
} from "@/lib/courseWorkspace/aiGenerationQueue";
import { ArtifactRevisionError, createArtifactRevision, updateArtifactInPlace } from "@/lib/courseWorkspace/artifactRevision";
import { ArtifactPayloadError, parseArtifactEditBody } from "@/lib/courseWorkspace/artifactPayload";
import {
  createPrismaArtifactRevisionStore,
  createPrismaArtifactWorkflowStore,
  createPrismaMutableArtifactStore
} from "@/lib/courseWorkspace/prismaArtifactStores";
import { ArtifactWorkflowError, deleteArtifact } from "@/lib/courseWorkspace/artifactWorkflow";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  if (canManage) await recoverAiGenerationJobFromDatabase(courseId, artifactId);
  const artifact = await db.courseAiArtifact.findFirst({
    where: {
      id: artifactId,
      courseId,
      deletedAt: null,
      ...(canManage ? {} : { status: "PUBLISHED", appType: "ppt_courseware" })
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
  ARTIFACT_SOURCE_NOT_EDITABLE: "当前 AI 产物不能编辑",
  ARTIFACT_REVISION_CONFLICT: "内容已被其他操作更新，请刷新后重试"
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const source = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId },
    select: { appType: true, payload: true, lockVersion: true, status: true }
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
    if (edit.lockVersion !== source.lockVersion) throw new ArtifactRevisionError("ARTIFACT_REVISION_CONFLICT", true);
    const artifact = source.status === "DRAFT"
      ? await updateArtifactInPlace(createPrismaMutableArtifactStore(), {
          courseId,
          artifactId,
          expectedLockVersion: edit.lockVersion,
          title: edit.title,
          payload: edit.payload
        })
      : await createArtifactRevision(createPrismaArtifactRevisionStore(), {
          courseId,
          sourceArtifactId: artifactId,
          userId: user.id,
          title: edit.title,
          payload: edit.payload
        });
    return NextResponse.json({ artifact: toSafeAiArtifactDto(artifact, { canManage: true, jobsAhead: null }) });
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  let lockVersion: number;
  try {
    const body = await request.json() as { lockVersion?: unknown };
    if (!Number.isInteger(body.lockVersion) || Number(body.lockVersion) < 0) throw new Error();
    lockVersion = Number(body.lockVersion);
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "删除参数无效" }, { status: 400 });
  }

  try {
    const result = await deleteArtifact(createPrismaArtifactWorkflowStore(), {
      courseId,
      artifactId,
      expectedLockVersion: lockVersion
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ArtifactWorkflowError) {
      const messages: Record<string, string> = {
        ARTIFACT_NOT_FOUND: "AI 产物不存在",
        ARTIFACT_DELETE_REQUIRES_WITHDRAWAL: "已发布内容必须先撤回后再删除",
        ARTIFACT_DELETE_CONFLICT: "内容已被其他操作更新，请刷新后重试"
      };
      return NextResponse.json({
        code: error.code,
        error: messages[error.code] ?? "无法删除 AI 产物",
        retryable: error.retryable
      }, { status: error.code === "ARTIFACT_NOT_FOUND" ? 404 : 409 });
    }
    throw error;
  }
}
