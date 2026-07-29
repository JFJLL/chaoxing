import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listCourseCollaborators } from "@/lib/courseWorkspace/courseCollaborators";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { courseId } = await context.params;
    const result = await listCourseCollaborators(user, courseId);
    return NextResponse.json({ collaborators: result.collaborators.map((item) => ({
      id: item.user.id, name: item.user.name, email: item.user.email, role: item.role, joinedAt: item.createdAt
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理协作教师" }, { status: 403 });
  }
}
