import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { assertOwnerFolder, listOwnerDriveFolders } from "@/lib/copilot/files";
import { getCopilotAnalytics } from "@/lib/courseWorkspace/copilot";

type RouteContext = { params: Promise<{ courseId: string }> };
const settingsSchema = z.object({ folderId: z.string().min(1).max(160).nullable() }).strict();

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const course = await requireCourseOwner(user, courseId);
    const [folders, analytics] = await Promise.all([listOwnerDriveFolders(user), getCopilotAnalytics(user, courseId)]);
    return Response.json({ folderId: course.copilotFolderId, folders, analytics });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Copilot 设置加载失败" }, { status: 403 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
    const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "请选择有效的云盘文件夹" }, { status: 400 });
    if (parsed.data.folderId) await assertOwnerFolder(user, parsed.data.folderId);
    const course = await db.course.update({ where: { id: courseId }, data: { copilotFolderId: parsed.data.folderId } });
    return Response.json({ folderId: course.copilotFolderId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Copilot 设置更新失败" }, { status: 403 });
  }
}
