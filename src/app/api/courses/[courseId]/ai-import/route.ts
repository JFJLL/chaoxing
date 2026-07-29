import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import {
  assertSupportedUpload,
  assertUploadSize
} from "@/lib/storage";
import { storeDriveUpload } from "@/lib/copilot/files";
import { CourseDriveError, ensureCoursePurposeFolder } from "@/lib/courseDrive/service";
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
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  await recoverImportJobsFromDatabase(courseId);

  const jobs = await db.documentImportJob.findMany({
    where: { courseId, deletedAt: null },
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
  let course: Awaited<ReturnType<typeof requireCourseManager>>;
  try {
    course = await requireCourseManager(user, courseId);
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
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);
    const legacyFile = formData.get("file");
    if (!files.length && legacyFile instanceof File) files.push(legacyFile);
    if (!files.length) return NextResponse.json({ error: "请上传至少一份文档" }, { status: 400 });
    if (files.length > 20) return NextResponse.json({ error: "一次最多上传 20 份文档" }, { status: 400 });
    try {
      for (const file of files) {
        assertSupportedUpload(file.name);
        assertUploadSize(file.size);
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "文件不符合上传要求" }, { status: 400 });
    }
    let courseDocumentsFolder;
    try {
      courseDocumentsFolder = await ensureCoursePurposeFolder(user, courseId, "COURSE_DOCUMENTS");
    } catch (error) {
      if (error instanceof CourseDriveError) {
        return NextResponse.json({
          code: error.code,
          error: error.message,
          retryable: false
        }, { status: error.status });
      }
      throw error;
    }

    const batch = await db.documentImportBatch.create({
      data: { courseId, userId: user.id, status: "PROCESSING" },
      select: { id: true }
    });
    const jobs: Array<{ id: string }> = [];
    for (const file of files) {
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
          return NextResponse.json({
            code: error.code,
            error: error.message,
            retryable: error.retryable,
            batchId: batch.id,
            jobIds: jobs.map((job) => job.id)
          }, { status: error.status });
        }
        throw error;
      }
      try {
        const driveFile = await storeDriveUpload({
          ownerId: courseDocumentsFolder.ownerId,
          parentId: courseDocumentsFolder.id,
          file
        });
        const job = await db.documentImportJob.create({
          data: {
            courseId,
            userId: user.id,
            batchId: batch.id,
            status: "QUEUED",
            originalName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
            filePath: driveFile.path,
            driveFileId: driveFile.id,
            contentHash: driveFile.contentHash
          },
          select: { id: true }
        });
        jobs.push(job);
        enqueueImportJob(job.id);
      } finally {
        admission.release();
      }
    }

    return NextResponse.json({
      batchId: batch.id,
      jobId: jobs[0]?.id,
      jobIds: jobs.map((job) => job.id),
      status: "QUEUED"
    }, { status: 202 });
  } finally {
    requestLease.release();
  }
}
