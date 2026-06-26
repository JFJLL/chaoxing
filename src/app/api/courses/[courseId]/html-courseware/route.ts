import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);

  const artifact = await db.courseAiArtifact.findFirst({
    where: { courseId, appType: "html_courseware", status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }]
  });

  if (!artifact) {
    return NextResponse.json({ artifact: null });
  }

  return NextResponse.json({
    artifact: {
      ...artifact,
      payload: JSON.parse(artifact.payload)
    }
  });
}
