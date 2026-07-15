import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { gradeObjectiveAnswer } from "@/lib/teaching/assessment";
import { parseOptions } from "@/lib/teaching/assessmentInput";

type RouteContext = { params: Promise<{ courseId: string; assignmentId: string }> };
const schema = z.object({ action: z.enum(["SAVE", "SUBMIT"]), answers: z.array(z.object({ questionId: z.string(), response: z.string().max(20_000) })).max(200) });

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, assignmentId } = await context.params;
  await requireCourseAccess(user, courseId);
  const enrollment = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } });
  if (!enrollment) return NextResponse.json({ error: "只有选课学生可以提交作业" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "作答内容无效" }, { status: 400 });
  const assignment = await db.assignment.findFirst({ where: { id: assignmentId, courseId, status: "PUBLISHED" }, include: { questions: true, extensions: { where: { userId: user.id }, select: { dueAt: true } } } });
  const now = new Date();
  if (!assignment || (assignment.publishAt && assignment.publishAt > now)) return NextResponse.json({ error: "作业尚未发布" }, { status: 404 });
  const effectiveDueAt = assignment.extensions[0]?.dueAt ?? assignment.dueAt;
  const late = Boolean(effectiveDueAt && effectiveDueAt < now);
  if (parsed.data.action === "SUBMIT" && late && !assignment.allowLate) return NextResponse.json({ error: "作业已截止" }, { status: 409 });
  const questionMap = new Map(assignment.questions.map((question) => [question.id, question]));
  const validAnswers = parsed.data.answers.filter((answer) => questionMap.has(answer.questionId));
  const existing = await db.assignmentSubmission.findUnique({ where: { assignmentId_userId: { assignmentId, userId: user.id } } });
  if (existing && !["DRAFT", "RETURNED"].includes(existing.status)) return NextResponse.json({ error: "作业已提交" }, { status: 409 });
  const submission = await db.assignmentSubmission.upsert({
    where: { assignmentId_userId: { assignmentId, userId: user.id } },
    create: { assignmentId, userId: user.id, status: "DRAFT" },
    update: {}
  });
  await db.$transaction(validAnswers.map((answer) => {
    const question = questionMap.get(answer.questionId)!;
    const score = parsed.data.action === "SUBMIT" ? gradeObjectiveAnswer({ type: question.type, answer: question.answer, response: answer.response, points: question.points, options: parseOptions(question.options) }) : null;
    return db.assignmentAnswer.upsert({ where: { submissionId_questionId: { submissionId: submission.id, questionId: answer.questionId } }, create: { submissionId: submission.id, questionId: answer.questionId, response: answer.response, score }, update: { response: answer.response, score } });
  }));
  if (parsed.data.action === "SUBMIT") {
    const answers = await db.assignmentAnswer.findMany({ where: { submissionId: submission.id }, include: { question: true } });
    const pendingManual = answers.some((answer) => answer.question.type === "short_answer");
    const score = answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
    await db.assignmentSubmission.update({ where: { id: submission.id }, data: { status: pendingManual ? "SUBMITTED" : "GRADED", submittedAt: now, score, gradedAt: pendingManual ? null : now, late } });
  }
  return NextResponse.json({ ok: true });
}
