import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import { generateCourseAiArtifact } from "@/lib/courseWorkspace/generateAiArtifact";
import type { HtmlCoursewarePayload } from "@/types/courseWorkspace";

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

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { mapId?: string; title?: string };
  if (!body.mapId) {
    return NextResponse.json({ error: "请选择知识导图" }, { status: 400 });
  }

  const [course, map] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      include: {
        chapters: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } }
      }
    }),
    db.courseKnowledgeMap.findFirst({
      where: { id: body.mapId, courseId },
      include: {
        nodes: { orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }] },
        edges: true
      }
    })
  ]);
  if (!course || !map) {
    return NextResponse.json({ error: "知识导图不存在" }, { status: 404 });
  }

  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const containsEdges = map.edges.filter((edge) => edge.type === "contains");
  const chapterNodes = map.nodes.filter((node) => node.type === "chapter").sort((a, b) => a.order - b.order);
  const chapters = chapterNodes.length
    ? chapterNodes.map((chapter) => ({
        title: chapter.label,
        lessons: containsEdges
          .filter((edge) => edge.sourceId === chapter.id)
          .flatMap((edge) => {
            const node = nodesById.get(edge.targetId);
            return node && node.type === "lesson" ? [node] : [];
          })
          .sort((a, b) => a.order - b.order)
          .map((lesson) => ({ title: lesson.label, summary: lesson.summary }))
      }))
    : course.chapters.map((chapter) => ({
        title: chapter.title,
        lessons: chapter.lessons.map((lesson) => ({ title: lesson.title, summary: lesson.summary }))
      }));

  const payload = generateCourseAiArtifact({
    appType: "html_courseware",
    courseTitle: course.title,
    chapters,
    prompt: "页数：8；风格：课堂播放"
  }) as HtmlCoursewarePayload;
  payload.sourceMapId = map.id;

  const artifact = await db.courseAiArtifact.create({
    data: {
      courseId,
      userId: user.id,
      appType: "html_courseware",
      title: body.title?.trim() || `${map.title} HTML课件`,
      prompt: `来源知识导图：${map.title}`,
      payload: JSON.stringify(payload),
      sourceJobId: map.sourceJobId
    }
  });

  return NextResponse.json({ artifact: { ...artifact, payload } }, { status: 201 });
}
