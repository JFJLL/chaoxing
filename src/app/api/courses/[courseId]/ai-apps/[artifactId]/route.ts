import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  await requireCourseAccess(user, courseId);

  const artifact = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId }
  });

  if (!artifact) {
    return NextResponse.json({ error: "AI 产物不存在" }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}
