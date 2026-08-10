import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { composePublishedKnowledgeMaps } from "@/lib/knowledgeMap/knowledgeMapService";

type RouteContext = { params: Promise<{ courseId: string }> };
const schema = z.object({
  mapIds: z.array(z.string().min(1).max(200)).min(1).max(20),
  persist: z.boolean().optional().default(false)
}).strict();

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请选择 1 至 20 份课程文档" }, { status: 400 });
  try {
    const result = await composePublishedKnowledgeMaps({
      courseId,
      courseTitle: course.title,
      mapIds: parsed.data.mapIds,
      persist: isCourseManagerRecord(user, course) && parsed.data.persist && parsed.data.mapIds.length > 1
    });
    return Response.json({
      ...result,
      editTargetId: result.persisted ? result.map.id : parsed.data.mapIds.length === 1 ? parsed.data.mapIds[0] : null
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "知识图谱组合失败" }, { status: 400 });
  }
}
