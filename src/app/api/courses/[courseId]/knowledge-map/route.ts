import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } from "@/lib/knowledgeMap/knowledgeMapService";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);

  const map = await db.courseKnowledgeMap.findFirst({
    where: {
      courseId,
      status: "PUBLISHED",
      sourceJobId: { not: null },
      deletedAt: null,
      sourceJob: { deletedAt: null, status: { in: PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } }
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      nodes: { orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }] },
      edges: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!map) {
    return NextResponse.json({ map: null });
  }

  return NextResponse.json({ map });
}
