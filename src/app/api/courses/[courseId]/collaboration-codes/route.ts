import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  CourseCollaborationError,
  createCourseCollaborationCode,
  listCourseCollaborationCodes,
  revokeCourseCollaborationCode
} from "@/lib/courseWorkspace/courseCollaborators";

type RouteContext = { params: Promise<{ courseId: string }> };
const createSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().min(1).max(500).nullable().optional()
}).strict();
const deleteSchema = z.object({ codeId: z.string().trim().min(1) }).strict();

function failure(error: unknown) {
  if (error instanceof CourseCollaborationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof z.ZodError) return NextResponse.json({ error: "协作码设置无效" }, { status: 400 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理教师协作码" }, { status: 403 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { courseId } = await context.params;
    return NextResponse.json({ codes: await listCourseCollaborationCodes(user, courseId) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { courseId } = await context.params;
    const input = createSchema.parse(await request.json().catch(() => ({})));
    const code = await createCourseCollaborationCode(user, courseId, {
      expiresAt: input.expiresAt === null ? null : input.expiresAt ? new Date(input.expiresAt) : undefined,
      maxUses: input.maxUses
    });
    return NextResponse.json({ code }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { courseId } = await context.params;
    const input = deleteSchema.parse(await request.json());
    await revokeCourseCollaborationCode(user, courseId, input.codeId);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
