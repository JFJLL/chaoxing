import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireCourseManager, requireCourseOwner } from "@/lib/permissions";
import { getCopilotAnalytics } from "@/lib/courseWorkspace/copilot";
import { listCourseDriveRootCandidates, updateCourseDriveSettings } from "@/lib/courseDrive/service";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";

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
    const canBindRoot = user.role === "ADMIN" || course.ownerId === user.id;
    const [folders, analytics] = await Promise.all([
      canBindRoot ? listCourseDriveRootCandidates(user, courseId) : Promise.resolve([]),
      getCopilotAnalytics(user, courseId)
    ]);
    return Response.json({
      folderId: course.driveRootFolderId,
      copilotName: course.copilotName,
      folders,
      analytics,
      canBindRoot
    });
  } catch (error) {
    return courseDriveErrorResponse(error, "AI智能体设置加载失败");
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
    const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "AI智能体设置无效：名称为 1–40 个字符" }, { status: 400 });
    const includesFolderId = Object.prototype.hasOwnProperty.call(parsed.data, "folderId");
    if (includesFolderId) await requireCourseOwner(user, courseId);
    if (parsed.data.folderId === null) {
      return Response.json({ error: "课程云盘只能重新绑定，不能解除绑定" }, { status: 400 });
    }
    const course = await updateCourseDriveSettings(user, courseId, {
      ...(parsed.data.folderId === undefined ? {} : { folderId: parsed.data.folderId }),
      ...(parsed.data.copilotName === undefined ? {} : { copilotName: parsed.data.copilotName })
    });
    return Response.json({ folderId: course.driveRootFolderId, copilotName: course.copilotName });
  } catch (error) {
    return courseDriveErrorResponse(error, "AI智能体设置更新失败");
  }
}
