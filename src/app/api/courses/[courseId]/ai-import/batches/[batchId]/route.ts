import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string; batchId: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, batchId } = await context.params;

  const batch = await db.documentImportBatch.findFirst({
    where: { id: batchId, courseId },
    select: { id: true }
  });
  if (!batch) {
    return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
  }
  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  // Soft-delete every remaining job in the batch. The course drive originals,
  // any saved course directory, and published knowledge maps are intentionally
  // left untouched; only the import record disappears. deletedAt is the source
  // of truth for visibility, so an in-flight worker cannot resurface the batch.
  await db.documentImportJob.updateMany({
    where: { batchId: batch.id, deletedAt: null },
    data: { status: "DELETED", deletedAt: new Date() }
  });

  revalidatePath(`/space/courses/${courseId}`, "layout");

  return NextResponse.json({ ok: true });
}
