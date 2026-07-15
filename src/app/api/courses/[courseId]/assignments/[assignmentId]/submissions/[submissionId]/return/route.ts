import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; assignmentId: string; submissionId: string }> };
export async function PUT(_request: Request, context: RouteContext) {
  const user = await requireUser(); const { courseId, assignmentId, submissionId } = await context.params; await requireCourseOwner(user, courseId);
  const submission = await db.assignmentSubmission.findFirst({ where: { id: submissionId, assignmentId, assignment: { courseId } }, select: { id: true } });
  if (!submission) return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  await db.assignmentSubmission.update({ where: { id: submissionId }, data: { status: "RETURNED", submittedAt: null, score: null, gradedAt: null } });
  return NextResponse.json({ ok: true });
}
