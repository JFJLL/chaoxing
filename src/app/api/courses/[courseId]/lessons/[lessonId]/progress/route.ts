import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; lessonId: string }> };
const schema = z.object({ completed: z.boolean() });
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId, lessonId } = await context.params; await requireCourseAccess(user, courseId);
  const enrollment = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } }); if (!enrollment) return NextResponse.json({ error: "只有选课学生可以记录课时进度" }, { status: 403 });
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, chapter: { courseId } }, select: { id: true } }); if (!lesson) return NextResponse.json({ error: "课时不存在" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "进度状态无效" }, { status: 400 });
  const progress = await db.lessonProgress.upsert({ where: { lessonId_userId: { lessonId, userId: user.id } }, create: { lessonId, userId: user.id, completedAt: parsed.data.completed ? new Date() : null }, update: { completedAt: parsed.data.completed ? new Date() : null } });
  return NextResponse.json({ progress });
}
