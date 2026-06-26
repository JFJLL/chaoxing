import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;

  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  await db.course.delete({
    where: { id: courseId }
  });

  return NextResponse.json({ ok: true });
}
