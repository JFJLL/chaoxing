import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; noticeId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, noticeId } = await context.params;
  await requireCourseAccess(user, courseId);
  const enrollment = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } }, select: { id: true } });
  if (!enrollment) return NextResponse.json({ error: "只有课程学生会计入通知阅读统计" }, { status: 403 });
  const notice = await db.announcement.findFirst({ where: { id: noticeId, courseId, status: "PUBLISHED" }, select: { id: true, publishAt: true } });
  if (!notice || (notice.publishAt && notice.publishAt > new Date())) return NextResponse.json({ error: "通知不存在" }, { status: 404 });
  const read = await db.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: noticeId, userId: user.id } },
    create: { announcementId: noticeId, userId: user.id },
    update: { readAt: new Date() }
  });
  return NextResponse.json({ read });
}
