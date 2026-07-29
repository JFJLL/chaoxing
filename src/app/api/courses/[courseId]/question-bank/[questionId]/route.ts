import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { isValidChoiceAnswer, normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";
import { parseOptions } from "@/lib/teaching/assessmentInput";

type RouteContext = { params: Promise<{ courseId: string; questionId: string }> };
const schema = z.object({
  type: z.enum(["single_choice", "multiple_choice", "short_answer"]),
  stem: z.string().trim().min(1).max(10_000),
  options: z.array(z.string().trim().min(1)).min(2).max(12).optional(),
  answer: z.string().trim().min(1).max(10_000),
  explanation: z.string().trim().max(10_000),
  expectedVersion: z.number().int().positive()
}).superRefine((question, context) => {
  if (question.type !== "short_answer" && !question.options) context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "选择题至少需要两个选项" });
  else if (question.type !== "short_answer" && question.options && !isValidChoiceAnswer(question.answer, question.options, question.type === "multiple_choice")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["answer"], message: "标准答案必须对应已有选项" });
});

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, questionId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "题目内容无效" }, { status: 400 });
  const options = parsed.data.type === "short_answer" ? [] : parsed.data.options ?? [];
  const answer = parsed.data.type === "short_answer" ? parsed.data.answer : normalizeChoiceAnswer(parsed.data.answer, options, parsed.data.type === "multiple_choice");
  const updated = await db.courseQuestion.updateMany({
    where: { id: questionId, courseId, status: "APPROVED", version: parsed.data.expectedVersion },
    data: { type: parsed.data.type, stem: parsed.data.stem, options: options.length ? JSON.stringify(options) : null, answer, explanation: parsed.data.explanation, version: { increment: 1 }, approvedAt: new Date() }
  });
  if (updated.count !== 1) {
    const exists = await db.courseQuestion.findFirst({ where: { id: questionId, courseId, status: "APPROVED" }, select: { id: true } });
    return NextResponse.json({ error: exists ? "题目已被其他操作更新，请关闭后重新打开" : "题目不存在或已停用" }, { status: exists ? 409 : 404 });
  }
  const question = await db.courseQuestion.findUnique({ where: { id: questionId }, include: { sourceArtifact: { select: { title: true, version: true } } } });
  if (!question) return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  return NextResponse.json({ question: { id: question.id, type: question.type, stem: question.stem, options: parseOptions(question.options), answer: question.answer, explanation: question.explanation, version: question.version, sourceTitle: question.sourceArtifact?.title ?? "AI 题库", sourceVersion: question.sourceArtifact?.version ?? null } });
}
