import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string; mapId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, mapId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const map = await db.courseKnowledgeMap.findFirst({
    where: { id: mapId, courseId }
  });
  if (!map) {
    return NextResponse.json({ error: "知识导图不存在" }, { status: 404 });
  }

  const published = await db.$transaction(async (tx) => {
    await tx.courseKnowledgeMap.updateMany({
      where: { courseId, status: "PUBLISHED", id: { not: mapId } },
      data: { status: "ARCHIVED" }
    });
    return tx.courseKnowledgeMap.update({
      where: { id: mapId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
      include: { nodes: true, edges: true }
    });
  });

  return NextResponse.json({ map: published });
}
