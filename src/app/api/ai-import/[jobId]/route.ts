import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getImportQueueSnapshot } from "@/lib/imports/importQueue";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findFirst({
    where: {
      id: jobId,
      OR: [{ userId: user.id }, { course: { ownerId: user.id } }]
    },
    include: {
      course: {
        select: { id: true, title: true }
      }
    }
  });

  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
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
