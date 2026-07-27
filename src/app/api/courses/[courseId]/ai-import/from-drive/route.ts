import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { requireCourseDriveTarget } from "@/lib/courseDrive/service";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { assertSupportedUpload, assertUploadSize } from "@/lib/storage";
import {
  ImportAdmissionError,
  enqueueImportJob,
  reserveImportJobAdmission
} from "@/lib/imports/importQueue";

type RouteContext = { params: Promise<{ courseId: string }> };
const bodySchema = z.object({
  driveFileIds: z.array(z.string().trim().min(1)).min(1).max(100)
});

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择至少一个课程云盘文档" }, { status: 400 });
  const uniqueIds = [...new Set(parsed.data.driveFileIds)];
  try {
    const course = await requireCourseOwner(user, courseId);
    const files = [];
    for (const fileId of uniqueIds) {
      const target = await requireCourseDriveTarget(user, courseId, fileId);
      if (target.kind === "folder") return NextResponse.json({ error: "不能把文件夹作为课程文档导入" }, { status: 400 });
      assertSupportedUpload(target.name);
      assertUploadSize(target.size);
      if (!target.path) return NextResponse.json({ error: `“${target.name}”缺少可读取的存储文件` }, { status: 409 });
      files.push(target);
    }
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
          return NextResponse.json(
            { code: error.code, error: error.message, retryable: error.retryable, jobs, jobIds: jobs.map((job) => job.id) },
            { status: error.status }
          );
        }
        throw error;
      }
      try {
        const job = await db.documentImportJob.create({
          data: {
            courseId,
            userId: user.id,
            status: "QUEUED",
            originalName: file.name,
            fileSize: file.size,
            mimeType: file.mimeType,
            filePath: file.path,
            driveFileId: file.id
          },
          select: { id: true }
        });
        jobs.push(job);
        enqueueImportJob(job.id);
      } finally {
        admission.release();
      }
    }
    return NextResponse.json({ jobs, jobIds: jobs.map((job) => job.id) }, { status: 201 });
  } catch (error) {
    return courseDriveErrorResponse(error, "云盘文档导入失败");
  }
}
