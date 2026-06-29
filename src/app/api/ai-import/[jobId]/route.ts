import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { getImportQueueSnapshot } from "@/lib/imports/importQueue";

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
  const snapshot = getImportQueueSnapshot();
  const queueIndex = snapshot.pendingJobs.findIndex((id) => id === job.id);

  return NextResponse.json({
    job: {
      ...job,
      generatedOutline: job.generatedOutline ? JSON.parse(job.generatedOutline) : null,
      queuePosition: job.status === "QUEUED" && queueIndex >= 0 ? queueIndex + 1 : null
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
    await tx.courseKnowledgeMap.deleteMany({ where: { sourceJobId: job.id, status: { not: "PUBLISHED" } } });
    await tx.courseAiArtifact.deleteMany({ where: { sourceJobId: job.id, status: { not: "PUBLISHED" } } });
    await tx.documentImportJob.delete({ where: { id: job.id } });
  });

  return NextResponse.json({ ok: true });
}
