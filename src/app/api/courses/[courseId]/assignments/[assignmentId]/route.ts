import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { assessmentQuestionInputSchema, questionCreateRows } from "@/lib/teaching/assessmentInput";

type RouteContext = { params: Promise<{ courseId: string; assignmentId: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PUBLISH"), publishAt: z.string().datetime().nullable().optional() }),
  z.object({ action: z.literal("WITHDRAW") }),
  z.object({ action: z.literal("PUBLISH_RESULTS") }),
  z.object({ action: z.literal("CREATE_REVISION") }),
  z.object({ action: z.literal("EXTEND"), userId: z.string().min(1), dueAt: z.string().datetime().nullable() }),
  z.object({ action: z.literal("UPDATE_CONTENT"), title: z.string().trim().min(1).max(200), instructions: z.string().max(10_000).optional(), questions: z.array(assessmentQuestionInputSchema).min(1).max(200) }),
  z.object({ action: z.literal("SCHEDULE"), dueAt: z.string().datetime().nullable(), allowLate: z.boolean(), immediateFeedback: z.boolean() })
]);

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, assignmentId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "作业操作无效" }, { status: 400 });
  const assignment = await db.assignment.findFirst({ where: { id: assignmentId, courseId }, include: { questions: { orderBy: { order: "asc" } }, _count: { select: { questions: true } } } });
  if (!assignment) return NextResponse.json({ error: "作业不存在" }, { status: 404 });
  if (parsed.data.action === "CREATE_REVISION") {
    if (assignment.status === "DRAFT") return NextResponse.json({ error: "当前作业已经是可编辑草稿" }, { status: 409 });
    const revision = await db.assignment.create({ data: { courseId, createdById: user.id, title: `${assignment.title}（新版本）`, instructions: assignment.instructions, dueAt: null, allowLate: assignment.allowLate, immediateFeedback: assignment.immediateFeedback, sourceArtifactId: assignment.sourceArtifactId, questions: { create: assignment.questions.map((question) => ({ sourceQuestionId: question.sourceQuestionId, type: question.type, stem: question.stem, options: question.options, answer: question.answer, explanation: question.explanation, points: question.points, order: question.order })) } }, select: { id: true } });
    return NextResponse.json({ ok: true, itemId: revision.id });
  } else if (parsed.data.action === "UPDATE_CONTENT") {
    if (assignment.status !== "DRAFT") return NextResponse.json({ error: "已发布作业的题目内容不可修改" }, { status: 409 });
    await db.$transaction([db.assignmentQuestion.deleteMany({ where: { assignmentId } }), db.assignment.update({ where: { id: assignmentId }, data: { title: parsed.data.title, instructions: parsed.data.instructions, questions: { create: questionCreateRows(parsed.data.questions) } } })]);
  } else if (parsed.data.action === "PUBLISH") {
    if (assignment.status !== "DRAFT" || assignment._count.questions === 0) return NextResponse.json({ error: "只有包含题目的草稿可以发布" }, { status: 409 });
    await db.assignment.update({ where: { id: assignmentId }, data: { status: "PUBLISHED", publishedAt: new Date(), publishAt: parsed.data.publishAt ? new Date(parsed.data.publishAt) : new Date() } });
  } else if (parsed.data.action === "WITHDRAW") {
    await db.assignment.update({ where: { id: assignmentId }, data: { status: "WITHDRAWN" } });
  } else if (parsed.data.action === "PUBLISH_RESULTS") {
    const pending = await db.assignmentSubmission.count({ where: { assignmentId, status: { in: ["DRAFT", "SUBMITTED", "RETURNED"] } } });
    if (pending) return NextResponse.json({ error: "仍有作业尚未完成批改" }, { status: 409 });
    await db.assignment.update({ where: { id: assignmentId }, data: { resultPublishedAt: new Date() } });
  } else if (parsed.data.action === "EXTEND") {
    const enrolled = await db.courseEnrollment.findUnique({ where: { courseId_userId: { courseId, userId: parsed.data.userId } } });
    if (!enrolled) return NextResponse.json({ error: "该学生未加入课程" }, { status: 400 });
    if (parsed.data.dueAt) await db.assignmentExtension.upsert({ where: { assignmentId_userId: { assignmentId, userId: parsed.data.userId } }, create: { assignmentId, userId: parsed.data.userId, dueAt: new Date(parsed.data.dueAt) }, update: { dueAt: new Date(parsed.data.dueAt) } });
    else await db.assignmentExtension.deleteMany({ where: { assignmentId, userId: parsed.data.userId } });
  } else {
    await db.assignment.update({ where: { id: assignmentId }, data: { dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null, allowLate: parsed.data.allowLate, immediateFeedback: parsed.data.immediateFeedback } });
  }
  return NextResponse.json({ ok: true });
}
