import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { CourseCollaborationError, removeCourseCollaborator } from "@/lib/courseWorkspace/courseCollaborators";

type RouteContext = { params: Promise<{ courseId: string; userId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { courseId, userId } = await context.params;
    await removeCourseCollaborator(user, courseId, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CourseCollaborationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权移除协作教师" }, { status: 403 });
  }
}
