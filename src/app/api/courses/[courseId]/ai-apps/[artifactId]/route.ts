import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  const artifact = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId, ...(canManage ? {} : { status: "PUBLISHED" }) }
  });

  if (!artifact) {
    return NextResponse.json({ error: "AI 产物不存在" }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}
