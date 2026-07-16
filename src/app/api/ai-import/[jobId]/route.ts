import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { getImportQueueSnapshot, recoverImportJobsFromDatabase } from "@/lib/imports/importQueue";
import { getJobsAhead } from "@/lib/imports/importProgress";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findUnique({
    where: { id: jobId },
    include: {
      course: {
        select: { id: true, title: true }
      }
    }
  });

  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  try {
    await requireCourseOwner(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  await recoverImportJobsFromDatabase(job.courseId);
  const snapshot = getImportQueueSnapshot();
  const queueIndex = snapshot.pendingJobs.findIndex((id) => id === job.id);

  return NextResponse.json({
    job: {
      ...job,
      generatedOutline: job.generatedOutline ? JSON.parse(job.generatedOutline) : null,
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
    await requireCourseOwner(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  await db.$transaction(async (tx) => {
    await tx.courseKnowledgeMap.deleteMany({ where: { sourceJobId: job.id } });
    await tx.courseAiArtifact.deleteMany({ where: { sourceJobId: job.id, status: { not: "PUBLISHED" } } });
    await tx.documentImportJob.delete({ where: { id: job.id } });
  });

  revalidatePath(`/space/courses/${job.courseId}`, "layout");

  return NextResponse.json({ ok: true });
}
