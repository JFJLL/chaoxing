import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { createAttendanceCredential } from "@/lib/teaching/attendanceCredential";

type RouteContext = { params: Promise<{ courseId: string; sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, sessionId } = await context.params;
  await requireCourseOwner(user, courseId);
  const session = await db.attendanceSession.findFirst({ where: { id: sessionId, courseId, status: "ACTIVE" } });
  if (!session || (session.endsAt && session.endsAt <= new Date())) return NextResponse.json({ error: "签到已结束" }, { status: 409 });
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "签到服务配置缺失" }, { status: 500 });
  return NextResponse.json(createAttendanceCredential({ sessionId, secret }));
}
