import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { getImportQueueSnapshot, recoverImportJobFromDatabase } from "@/lib/imports/importQueue";
import { getJobsAhead } from "@/lib/imports/importProgress";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const ownerLookup = await db.documentImportJob.findUnique({
    where: { id: jobId },
    select: { id: true, courseId: true }
  });

  if (!ownerLookup) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  try {
    await requireCourseManager(user, ownerLookup.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  await recoverImportJobFromDatabase(ownerLookup.id, ownerLookup.courseId);
  const job = await db.documentImportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      currentStage: true,
      errorMessage: true,
      generatedOutline: true,
      knowledgeMaps: { select: { id: true }, take: 1 }
    }
  });
  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  const snapshot = getImportQueueSnapshot();
  const queueIndex = snapshot.pendingJobs.findIndex((id) => id === job.id);

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      currentStage: job.currentStage,
      errorMessage: job.errorMessage,
      reviewReady: job.status !== "READY_FOR_REVIEW" || Boolean(job.generatedOutline && job.knowledgeMaps.length),
      jobsAhead: job.status === "QUEUED" ? getJobsAhead(snapshot.activeWorkers, queueIndex) : null
    }
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  try {
    await requireCourseManager(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  await db.documentImportJob.update({
    where: { id: job.id },
    data: { status: "DELETED", deletedAt: new Date() }
  });

  revalidatePath(`/space/courses/${job.courseId}`, "layout");

  return NextResponse.json({ ok: true });
}
