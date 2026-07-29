import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { listOwnerDriveFolders } from "@/lib/copilot/files";
import { getCopilotAnalytics } from "@/lib/courseWorkspace/copilot";
import { bindCourseDriveRoot } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string }> };
const settingsSchema = z.object({
  folderId: z.string().min(1).max(160).nullable().optional(),
  copilotName: z.string().trim().min(1).max(40).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "没有可更新的设置");

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const course = await requireCourseManager(user, courseId);
    const [folders, analytics] = await Promise.all([listOwnerDriveFolders(user), getCopilotAnalytics(user, courseId)]);
    return Response.json({ folderId: course.driveRootFolderId, copilotName: course.copilotName, folders, analytics });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Copilot 设置加载失败" }, { status: 403 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
    const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Copilot 设置无效：名称为 1–40 个字符" }, { status: 400 });
    if (parsed.data.folderId === null) {
      return Response.json({ error: "课程云盘只能重新绑定，不能解除绑定" }, { status: 400 });
    }
    if (parsed.data.folderId) await bindCourseDriveRoot(user, courseId, parsed.data.folderId);
    const course = await db.course.update({
      where: { id: courseId },
      data: {
        copilotName: parsed.data.copilotName
      }
    });
    return Response.json({ folderId: course.driveRootFolderId, copilotName: course.copilotName });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Copilot 设置更新失败" }, { status: 403 });
  }
}
