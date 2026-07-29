import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CourseCollaborationError, joinCourseAsCollaborator } from "@/lib/courseWorkspace/courseCollaborators";

const inputSchema = z.object({ code: z.string().trim().min(1).max(100) }).strict();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = inputSchema.parse(await request.json());
    const result = await joinCourseAsCollaborator(user, input.code);
    return NextResponse.json(result, { status: result.joined ? 201 : 200 });
  } catch (error) {
    if (error instanceof CourseCollaborationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "请输入有效的教师协作码", code: "COLLABORATION_CODE_INVALID" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "加入课程失败" }, { status: 403 });
  }
}
