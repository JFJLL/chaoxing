import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; assignmentId: string; submissionId: string }> };
const schema = z.object({ feedback: z.string().max(10_000).default(""), answers: z.array(z.object({ answerId: z.string(), score: z.number().min(0).max(1_000), feedback: z.string().max(10_000).optional() })) });

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, assignmentId, submissionId } = await context.params;
  await requireCourseOwner(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "评分内容无效" }, { status: 400 });
  const submission = await db.assignmentSubmission.findFirst({ where: { id: submissionId, assignmentId, assignment: { courseId } }, include: { answers: { include: { question: true } } } });
  if (!submission) return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  const permitted = new Map(submission.answers.map((answer) => [answer.id, answer.question.points]));
  for (const answer of parsed.data.answers) {
    const max = permitted.get(answer.answerId);
    if (max === undefined || answer.score > max) return NextResponse.json({ error: "单题评分超出题目分值" }, { status: 400 });
  }
  await db.$transaction(parsed.data.answers.map((answer) => db.assignmentAnswer.update({ where: { id: answer.answerId }, data: { score: answer.score, feedback: answer.feedback } })));
  const answers = await db.assignmentAnswer.findMany({ where: { submissionId } });
  const score = answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0);
  await db.assignmentSubmission.update({ where: { id: submissionId }, data: { status: "GRADED", score, feedback: parsed.data.feedback, gradedAt: new Date() } });
  return NextResponse.json({ score });
}
