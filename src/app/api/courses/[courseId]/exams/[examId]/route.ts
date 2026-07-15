import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { assessmentQuestionInputSchema, questionCreateRows } from "@/lib/teaching/assessmentInput";
import { gradeObjectiveAnswer } from "@/lib/teaching/assessment";

type RouteContext = { params: Promise<{ courseId: string; examId: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PUBLISH") }), z.object({ action: z.literal("WITHDRAW") }), z.object({ action: z.literal("PUBLISH_RESULTS") }),
  z.object({ action: z.literal("UPDATE_CONTENT"), title: z.string().trim().min(1).max(200), instructions: z.string().max(10_000).optional(), questions: z.array(assessmentQuestionInputSchema).min(1).max(200) }),
  z.object({ action: z.literal("SCHEDULE"), startsAt: z.string().datetime().nullable(), endsAt: z.string().datetime().nullable(), durationMinutes: z.number().int().min(1).max(600) })
]);

async function submitExpiredAttempts(exam: { id: string; durationMinutes: number; endsAt: Date | null }) {
  const now = new Date();
  const attempts = await db.examAttempt.findMany({
    where: { examId: exam.id, status: "IN_PROGRESS" },
    include: { answers: { include: { question: true } } }
  });
  for (const attempt of attempts) {
    const durationEnd = new Date(attempt.startedAt.getTime() + exam.durationMinutes * 60_000);
    const deadline = exam.endsAt && exam.endsAt < durationEnd ? exam.endsAt : durationEnd;
    if (deadline > now) continue;
    const scoredAnswers = attempt.answers.map((answer) => ({
      id: answer.id,
      score: gradeObjectiveAnswer({
        type: answer.question.type,
        answer: answer.question.answer,
        response: answer.response,
        points: answer.question.points
      })
    }));
    const pendingManual = attempt.answers.some((answer) => answer.question.type === "short_answer");
    const score = scoredAnswers.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
    await db.$transaction([
      ...scoredAnswers.map((answer) => db.examAnswer.update({ where: { id: answer.id }, data: { score: answer.score } })),
      db.examAttempt.update({
        where: { id: attempt.id },
        data: { status: pendingManual ? "SUBMITTED" : "GRADED", submittedAt: deadline, score, gradedAt: pendingManual ? null : deadline }
      })
    ]);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId, examId } = await context.params; await requireCourseOwner(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "考试操作无效" }, { status: 400 });
  const exam = await db.exam.findFirst({ where: { id: examId, courseId }, include: { _count: { select: { questions: true } } } }); if (!exam) return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  if (parsed.data.action === "UPDATE_CONTENT") {
    if (exam.status !== "DRAFT") return NextResponse.json({ error: "已发布考试的题目内容不可修改" }, { status: 409 });
    await db.$transaction([db.examQuestion.deleteMany({ where: { examId } }), db.exam.update({ where: { id: examId }, data: { title: parsed.data.title, instructions: parsed.data.instructions, questions: { create: questionCreateRows(parsed.data.questions) } } })]);
  } else if (parsed.data.action === "PUBLISH") {
    if (exam.status !== "DRAFT" || exam._count.questions === 0) return NextResponse.json({ error: "只有包含题目的草稿可以发布" }, { status: 409 });
    await db.exam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  } else if (parsed.data.action === "WITHDRAW") await db.exam.update({ where: { id: examId }, data: { status: "WITHDRAWN" } });
  else if (parsed.data.action === "PUBLISH_RESULTS") { await submitExpiredAttempts(exam); const pending = await db.examAttempt.count({ where: { examId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } } }); if (pending) return NextResponse.json({ error: "仍有答卷尚未提交或完成批改" }, { status: 409 }); await db.exam.update({ where: { id: examId }, data: { resultPublishedAt: new Date() } }); }
  else {
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null; const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return NextResponse.json({ error: "考试结束时间必须晚于开始时间" }, { status: 400 });
    await db.exam.update({ where: { id: examId }, data: { startsAt, endsAt, durationMinutes: parsed.data.durationMinutes } });
  }
  return NextResponse.json({ ok: true });
}
