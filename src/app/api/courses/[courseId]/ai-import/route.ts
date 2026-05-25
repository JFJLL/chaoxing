import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { assertSupportedUpload, storeImportFile } from "@/lib/storage";
import { runImportJob } from "@/lib/imports/runImportJob";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseOwner(user, courseId);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传文档" }, { status: 400 });
  }

  assertSupportedUpload(file.name);
  const job = await db.documentImportJob.create({
    data: {
      courseId,
      userId: user.id,
      status: "QUEUED",
      originalName: file.name,
      mimeType: file.type || null
    }
  });

  const filePath = await storeImportFile({
    jobId: job.id,
    fileName: file.name,
    bytes: Buffer.from(await file.arrayBuffer())
  });

  await db.documentImportJob.update({
    where: { id: job.id },
    data: { filePath }
  });

  await runImportJob(job.id);

  return NextResponse.json({ jobId: job.id });
}
