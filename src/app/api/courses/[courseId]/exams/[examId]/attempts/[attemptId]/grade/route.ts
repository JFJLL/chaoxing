import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; examId: string; attemptId: string }> };
const schema = z.object({ feedback: z.string().max(10_000).default(""), answers: z.array(z.object({ answerId: z.string(), score: z.number().min(0).max(1_000), feedback: z.string().max(10_000).optional() })) });
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId, examId, attemptId } = await context.params; await requireCourseOwner(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "评分内容无效" }, { status: 400 });
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, examId, exam: { courseId } }, include: { answers: { include: { question: true } } } }); if (!attempt) return NextResponse.json({ error: "答卷不存在" }, { status: 404 });
  const permitted = new Map(attempt.answers.map((answer) => [answer.id, answer.question.points])); for (const answer of parsed.data.answers) { const max = permitted.get(answer.answerId); if (max === undefined || answer.score > max) return NextResponse.json({ error: "单题评分超出题目分值" }, { status: 400 }); }
  await db.$transaction(parsed.data.answers.map((answer) => db.examAnswer.update({ where: { id: answer.answerId }, data: { score: answer.score, feedback: answer.feedback } })));
  const answers = await db.examAnswer.findMany({ where: { attemptId } }); const score = answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
  await db.examAttempt.update({ where: { id: attemptId }, data: { status: "GRADED", score, feedback: parsed.data.feedback, gradedAt: new Date() } }); return NextResponse.json({ score });
}
