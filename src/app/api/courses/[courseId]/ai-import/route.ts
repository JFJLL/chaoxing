import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { assertSupportedUpload, storeImportFile } from "@/lib/storage";
import { enqueueImportJob, getImportQueueSnapshot } from "@/lib/imports/importQueue";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseOwner(user, courseId);

  const jobs = await db.documentImportJob.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const snapshot = getImportQueueSnapshot();
  const pendingPositions = new Map(snapshot.pendingJobs.map((jobId, index) => [jobId, index + 1]));

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      ...job,
      generatedOutline: job.generatedOutline ? JSON.parse(job.generatedOutline) : null,
      queuePosition: job.status === "QUEUED" ? (pendingPositions.get(job.id) ?? null) : null
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
  await requireCourseOwner(user, courseId);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传文档" }, { status: 400 });
  }
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

  enqueueImportJob(job.id);

  return NextResponse.json({ jobId: job.id, status: "QUEUED" }, { status: 202 });
}
