import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string }> };

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().min(1).max(180).default(10)
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  let course;
  try {
    course = await requireCourseAccess(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问课程" }, { status: 403 });
  }
  const canManage = isCourseManagerRecord(user, course);
  const sessions = await db.attendanceSession.findMany({
    where: { courseId, ...(canManage ? {} : { status: { in: ["ACTIVE", "ENDED"] } }) },
    include: { records: canManage ? { include: { user: { select: { id: true, name: true } } } } : { where: { userId: user.id } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ sessions, canManage });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "签到名称或有效时长无效" }, { status: 400 });
  const startsAt = new Date();
  const session = await db.attendanceSession.create({
    data: {
      courseId,
      createdById: user.id,
      title: parsed.data.title,
      status: "ACTIVE",
      startsAt,
      endsAt: new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000)
    }
  });
  return NextResponse.json({ session }, { status: 201 });
}
