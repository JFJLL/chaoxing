import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { KnowledgeMapTextError } from "@/lib/knowledgeMap/knowledgeMapText";
import { saveKnowledgeMapTextRevision, softDeleteKnowledgeMapSeries } from "@/lib/knowledgeMap/knowledgeMapService";

type RouteContext = { params: Promise<{ courseId: string; mapId: string }> };
const updateSchema = z.object({
  text: z.string().trim().min(1).max(200_000),
  expectedVersion: z.number().int().positive()
}).strict();

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, mapId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "图谱文本无效" }, { status: 400 });
  try {
    const map = await saveKnowledgeMapTextRevision({ courseId, mapId, ...parsed.data });
    return Response.json({ map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识图谱保存失败";
    return Response.json({ error: message }, { status: error instanceof KnowledgeMapTextError ? 400 : message.includes("已被更新") ? 409 : 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, mapId } = await context.params;
  await requireCourseManager(user, courseId);
  try {
    const result = await softDeleteKnowledgeMapSeries(courseId, mapId);
    return Response.json({ ok: true, deletedVersions: result.count });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "知识图谱删除失败" }, { status: 404 });
  }
}
