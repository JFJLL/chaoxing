import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { enqueueImportJob } from "@/lib/imports/importQueue";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
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
  if (job.status !== "FAILED") {
    return NextResponse.json({ error: "只有失败任务可以重试" }, { status: 400 });
  }
  if (!job.filePath) {
    return NextResponse.json({ error: "任务缺少源文件，无法重试" }, { status: 400 });
  }

  const next = await db.documentImportJob.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      currentStage: "等待重试",
      retryCount: { increment: 1 },
      startedAt: null,
      finishedAt: null
    }
  });
  enqueueImportJob(job.id);

  return NextResponse.json({ job: next });
}
