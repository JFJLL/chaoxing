import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { verifyAttendanceCredential } from "@/lib/teaching/attendanceCredential";

type RouteContext = { params: Promise<{ courseId: string; sessionId: string }> };
const schema = z.object({ credential: z.string().trim().min(6).max(100) });

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, sessionId } = await context.params;
  await requireCourseAccess(user, courseId);
  const enrollment = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } });
  if (!enrollment) return NextResponse.json({ error: "只有选课学生可以签到" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "签到码格式无效" }, { status: 400 });
  const session = await db.attendanceSession.findFirst({ where: { id: sessionId, courseId, status: "ACTIVE" } });
  const now = new Date();
  if (!session || !session.startsAt || session.startsAt > now || (session.endsAt && session.endsAt < now)) return NextResponse.json({ error: "签到不在有效时间内" }, { status: 409 });
  const secret = process.env.SESSION_SECRET;
  if (!secret || !verifyAttendanceCredential({ sessionId, secret, value: parsed.data.credential, now })) return NextResponse.json({ error: "签到码已过期，请重新扫描" }, { status: 400 });
  const record = await db.attendanceRecord.upsert({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    create: { sessionId, userId: user.id, status: "PRESENT", method: parsed.data.credential.length === 6 ? "CODE" : "QR", signedAt: now },
    update: { status: "PRESENT", method: parsed.data.credential.length === 6 ? "CODE" : "QR", signedAt: now }
  });
  return NextResponse.json({ record });
}
