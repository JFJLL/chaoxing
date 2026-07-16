import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import {
  assertSupportedUpload,
  assertUploadSize
} from "@/lib/storage";
import { storeDriveUpload } from "@/lib/copilot/files";
import {
  ImportAdmissionError,
  acquireImportRequest,
  enqueueImportJob,
  getImportQueueSnapshot,
  recoverImportJobsFromDatabase,
  reserveImportJobAdmission
} from "@/lib/imports/importQueue";
import { getJobsAhead } from "@/lib/imports/importProgress";
import {
  ImportRequestBodyError,
  MAX_IMPORT_MULTIPART_BYTES,
  readBoundedMultipartFormData
} from "@/lib/imports/importUpload";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  await recoverImportJobsFromDatabase(courseId);

  const jobs = await db.documentImportJob.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const snapshot = getImportQueueSnapshot();

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      ...job,
      generatedOutline: job.generatedOutline ? JSON.parse(job.generatedOutline) : null,
      jobsAhead:
        job.status === "QUEUED"
          ? getJobsAhead(snapshot.activeWorkers, snapshot.pendingJobs.findIndex((jobId) => jobId === job.id))
          : null
    })),
    queue: {
      activeWorkers: snapshot.activeWorkers,
      pendingCount: snapshot.pendingJobs.length
    }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  let course: Awaited<ReturnType<typeof requireCourseOwner>>;
  try {
    course = await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const requestLease = acquireImportRequest(user.id, courseId);
  if (!requestLease.allowed) {
    return NextResponse.json({
      code: "AI_IMPORT_RATE_LIMITED",
      error: "导入请求过于频繁，请稍后重试",
      retryable: true
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(requestLease.retryAfterMs / 1_000))) }
    });
  }

  try {
    let formData: FormData;
    try {
      formData = await readBoundedMultipartFormData(request, MAX_IMPORT_MULTIPART_BYTES);
    } catch (error) {
      if (error instanceof ImportRequestBodyError && error.reason === "too_large") {
        return NextResponse.json({
          code: "AI_IMPORT_BODY_TOO_LARGE",
          error: "上传请求不能超过 52MB",
          retryable: false
        }, { status: 413 });
      }
      return NextResponse.json({ error: "请使用 multipart/form-data 上传文档" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文档" }, { status: 400 });
    }

    try {
      assertSupportedUpload(file.name);
      assertUploadSize(file.size);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "文件不符合上传要求" }, { status: 400 });
    }
    if (!course.copilotFolderId) {
      return NextResponse.json({
        code: "COPILOT_FOLDER_REQUIRED",
        error: "请先在 Copilot 设置中绑定课程云盘文件夹",
        retryable: false
      }, { status: 409 });
    }
    const copilotFolder = await db.driveFile.findFirst({
      where: { id: course.copilotFolderId, kind: "folder", deletedAt: null },
      select: { ownerId: true }
    });
    if (!copilotFolder) {
      return NextResponse.json({
        code: "COPILOT_FOLDER_UNAVAILABLE",
        error: "课程云盘文件夹已失效，请重新绑定",
        retryable: false
      }, { status: 409 });
    }

    let admission;
    try {
      admission = await reserveImportJobAdmission({
        institutionId: course.institutionId,
        courseId,
        userId: user.id,
        fileSize: file.size
      });
    } catch (error) {
      if (error instanceof ImportAdmissionError) {
        return NextResponse.json({ code: error.code, error: error.message, retryable: error.retryable }, { status: error.status });
      }
      throw error;
    }

    let job: { id: string };
    try {
      const driveFile = await storeDriveUpload({
        ownerId: copilotFolder.ownerId,
        parentId: course.copilotFolderId,
        file
      });
      job = await db.documentImportJob.create({
        data: {
          courseId,
          userId: user.id,
          status: "QUEUED",
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          filePath: driveFile.path,
          driveFileId: driveFile.id
        }
      });
    } finally {
      admission.release();
    }

    enqueueImportJob(job.id);

    return NextResponse.json({ jobId: job.id, status: "QUEUED" }, { status: 202 });
  } finally {
    requestLease.release();
  }
}
