import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import { assessmentQuestionInputSchema, questionCreateRows } from "@/lib/teaching/assessmentInput";
import { loadSourceQuestionInputs } from "@/lib/teaching/sourceQuestions";
import { aiPaperPayloadSchema } from "@/types/courseWorkspace";

type RouteContext = { params: Promise<{ courseId: string }> };
const createSchema = z.object({
  title: z.string().trim().min(1).max(200), instructions: z.string().trim().max(10_000).optional(),
  startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().min(1).max(600).default(60),
  sourceArtifactId: z.string().nullable().optional(),
  sourceQuestionIds: z.array(z.string()).max(200).default([]), questions: z.array(assessmentQuestionInputSchema).max(200).default([])
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId); const canManage = user.role === "ADMIN" || course.ownerId === user.id;
  const exams = await db.exam.findMany({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) }, include: { questions: { orderBy: { order: "asc" } }, attempts: canManage ? true : { where: { userId: user.id } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ exams });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser(); const { courseId } = await context.params; await requireCourseOwner(user, courseId);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "考试内容无效", details: parsed.error.flatten() }, { status: 400 });
  let paperQuestionIds: string[] = [];
  if (parsed.data.sourceArtifactId) {
    const artifact = await db.courseAiArtifact.findFirst({ where: { id: parsed.data.sourceArtifactId, courseId, appType: "paper_assembly", status: { in: ["APPROVED", "PUBLISHED"] } }, select: { payload: true } });
    if (!artifact?.payload) return NextResponse.json({ error: "AI 试卷模板不存在或尚未确认" }, { status: 400 });
    try { paperQuestionIds = aiPaperPayloadSchema.parse(JSON.parse(artifact.payload)).sections.flatMap((section) => section.questionIds); } catch { return NextResponse.json({ error: "AI 试卷模板内容无效" }, { status: 400 }); }
  }
  const allSourceIds = [...new Set([...paperQuestionIds, ...parsed.data.sourceQuestionIds])];
  const sourceQuestions = await loadSourceQuestionInputs(courseId, allSourceIds);
  if (sourceQuestions.length !== allSourceIds.length) return NextResponse.json({ error: "部分题库题目不存在或尚未确认" }, { status: 400 });
  const questions = [...sourceQuestions, ...parsed.data.questions];
  if (!questions.length) return NextResponse.json({ error: "考试至少需要一道题" }, { status: 400 });
  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null; const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) return NextResponse.json({ error: "考试结束时间必须晚于开始时间" }, { status: 400 });
  const exam = await db.exam.create({ data: { courseId, createdById: user.id, title: parsed.data.title, instructions: parsed.data.instructions, startsAt, endsAt, durationMinutes: parsed.data.durationMinutes, sourceArtifactId: parsed.data.sourceArtifactId, questions: { create: questionCreateRows(questions) } }, include: { questions: true } });
  return NextResponse.json({ exam }, { status: 201 });
}
