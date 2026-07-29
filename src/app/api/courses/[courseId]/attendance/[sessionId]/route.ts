import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; sessionId: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("END") }),
  z.object({ action: z.literal("REOPEN"), durationMinutes: z.number().int().min(1).max(180).default(10) }),
  z.object({ action: z.literal("SET_RECORD"), userId: z.string().min(1), status: z.enum(["PRESENT", "LEAVE", "ABSENT"]), note: z.string().max(500).optional() })
]);

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, sessionId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "签到操作无效" }, { status: 400 });
  const session = await db.attendanceSession.findFirst({ where: { id: sessionId, courseId } });
  if (!session) return NextResponse.json({ error: "签到不存在" }, { status: 404 });
  if (parsed.data.action === "END") {
    await db.attendanceSession.update({ where: { id: sessionId }, data: { status: "ENDED", endsAt: new Date() } });
  } else if (parsed.data.action === "REOPEN") {
    const now = new Date();
    await db.attendanceSession.update({ where: { id: sessionId }, data: { status: "ACTIVE", startsAt: now, endsAt: new Date(now.getTime() + parsed.data.durationMinutes * 60_000) } });
  } else {
    const enrolled = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: parsed.data.userId } } });
    if (!enrolled) return NextResponse.json({ error: "该学生未加入课程" }, { status: 400 });
    await db.attendanceRecord.upsert({
      where: { sessionId_userId: { sessionId, userId: parsed.data.userId } },
      create: { sessionId, userId: parsed.data.userId, status: parsed.data.status, method: "MANUAL", signedAt: parsed.data.status === "PRESENT" ? new Date() : null, note: parsed.data.note },
      update: { status: parsed.data.status, method: "MANUAL", signedAt: parsed.data.status === "PRESENT" ? new Date() : null, note: parsed.data.note }
    });
  }
  return NextResponse.json({ ok: true });
}
