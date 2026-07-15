import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { gradeObjectiveAnswer } from "@/lib/teaching/assessment";

type RouteContext = { params: Promise<{ courseId: string; examId: string }> };
const answerSchema = z.object({ action: z.enum(["SAVE", "SUBMIT"]), answers: z.array(z.object({ questionId: z.string(), response: z.string().max(20_000) })).max(200) });

async function loadExam(courseId: string, examId: string) { return db.exam.findFirst({ where: { id: examId, courseId, status: "PUBLISHED" }, include: { questions: true } }); }
function attemptDeadline(startedAt: Date, durationMinutes: number, examEnd: Date | null) { const durationEnd = new Date(startedAt.getTime() + durationMinutes * 60_000); return examEnd && examEnd < durationEnd ? examEnd : durationEnd; }

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId, examId } = await context.params; await requireCourseAccess(user, courseId);
  const enrollment = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } }); if (!enrollment) return NextResponse.json({ error: "只有选课学生可以参加考试" }, { status: 403 });
  const exam = await loadExam(courseId, examId); const now = new Date();
  if (!exam || (exam.startsAt && exam.startsAt > now) || (exam.endsAt && exam.endsAt <= now)) return NextResponse.json({ error: "当前不在考试时间内" }, { status: 409 });
  const existing = await db.examAttempt.findUnique({ where: { examId_userId: { examId, userId: user.id } } });
  if (existing) return NextResponse.json({ attempt: existing });
  const attempt = await db.examAttempt.create({ data: { examId, userId: user.id } }); return NextResponse.json({ attempt }, { status: 201 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId, examId } = await context.params; await requireCourseAccess(user, courseId);
  const parsed = answerSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "作答内容无效" }, { status: 400 });
  const exam = await loadExam(courseId, examId); if (!exam) return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  const attempt = await db.examAttempt.findUnique({ where: { examId_userId: { examId, userId: user.id } } }); if (!attempt) return NextResponse.json({ error: "请先开始考试" }, { status: 409 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "答卷已经提交" }, { status: 409 });
  const now = new Date(); const deadline = attemptDeadline(attempt.startedAt, exam.durationMinutes, exam.endsAt); const mustSubmit = now >= deadline; const submit = parsed.data.action === "SUBMIT" || mustSubmit;
  const questionMap = new Map(exam.questions.map((question) => [question.id, question])); const validAnswers = parsed.data.answers.filter((answer) => questionMap.has(answer.questionId));
  await db.$transaction(validAnswers.map((answer) => { const question = questionMap.get(answer.questionId)!; const score = submit ? gradeObjectiveAnswer({ type: question.type, answer: question.answer, response: answer.response, points: question.points }) : null; return db.examAnswer.upsert({ where: { attemptId_questionId: { attemptId: attempt.id, questionId: answer.questionId } }, create: { attemptId: attempt.id, questionId: answer.questionId, response: answer.response, score }, update: { response: answer.response, score } }); }));
  if (submit) { const answers = await db.examAnswer.findMany({ where: { attemptId: attempt.id }, include: { question: true } }); const pendingManual = answers.some((answer) => answer.question.type === "short_answer"); const score = answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0); await db.examAttempt.update({ where: { id: attempt.id }, data: { status: pendingManual ? "SUBMITTED" : "GRADED", submittedAt: now, score, gradedAt: pendingManual ? null : now } }); }
  return NextResponse.json({ ok: true, submitted: submit, deadline });
}
