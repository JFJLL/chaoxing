import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
import { applyOutlineToCourse } from "@/lib/imports/applyOutline";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  await requireCourseOwner(user, job.courseId);

  const body = (await request.json()) as { outline?: unknown };
  const outline = generatedCourseOutlineSchema.parse(body.outline);

  await db.$transaction(async (tx) => {
    await applyOutlineToCourse({ courseId: job.courseId, outline, actorId: user.id, tx });
    await tx.documentImportJob.update({
      where: { id: job.id },
      data: {
        generatedOutline: JSON.stringify(outline),
        status: "APPLIED"
      }
    });
  });

  return NextResponse.json({ ok: true });
}
