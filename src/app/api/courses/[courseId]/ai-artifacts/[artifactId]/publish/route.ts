import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string; artifactId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const artifact = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId }
  });
  if (!artifact) {
    return NextResponse.json({ error: "AI 产物不存在" }, { status: 404 });
  }

  const published = await db.$transaction(async (tx) => {
    await tx.courseAiArtifact.updateMany({
      where: { courseId, appType: artifact.appType, status: "PUBLISHED", id: { not: artifactId } },
      data: { status: "ARCHIVED" }
    });
    return tx.courseAiArtifact.update({
      where: { id: artifactId },
      data: { status: "PUBLISHED", publishedAt: new Date() }
    });
  });

  return NextResponse.json({ artifact: published });
}
