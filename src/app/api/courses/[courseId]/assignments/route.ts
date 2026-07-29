import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import { assessmentQuestionInputSchema, questionCreateRows } from "@/lib/teaching/assessmentInput";
import { loadSourceQuestionInputs } from "@/lib/teaching/sourceQuestions";

type RouteContext = { params: Promise<{ courseId: string }> };
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(10_000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  allowLate: z.boolean().default(false),
  immediateFeedback: z.boolean().default(false),
  sourceQuestionIds: z.array(z.string()).max(200).default([]),
  questions: z.array(assessmentQuestionInputSchema).max(200).default([])
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const assignments = await db.assignment.findMany({
    where: { courseId, ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }) },
    include: { questions: { orderBy: { order: "asc" } }, submissions: canManage ? true : { where: { userId: user.id } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "作业内容无效", details: parsed.error.flatten() }, { status: 400 });
  const sourceQuestions = await loadSourceQuestionInputs(courseId, parsed.data.sourceQuestionIds);
  if (sourceQuestions.length !== parsed.data.sourceQuestionIds.length) return NextResponse.json({ error: "部分题库题目不存在或尚未确认" }, { status: 400 });
  const questions = [...sourceQuestions, ...parsed.data.questions];
  if (!questions.length) return NextResponse.json({ error: "作业至少需要一道题" }, { status: 400 });
  const assignment = await db.assignment.create({
    data: {
      courseId,
      createdById: user.id,
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      allowLate: parsed.data.allowLate,
      immediateFeedback: parsed.data.immediateFeedback,
      questions: { create: questionCreateRows(questions) }
    },
    include: { questions: true }
  });
  return NextResponse.json({ assignment }, { status: 201 });
}
