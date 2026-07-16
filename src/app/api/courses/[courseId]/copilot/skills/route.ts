import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { readBoundedMultipartFormData } from "@/lib/imports/importUpload";
import { CopilotError, listCopilotSkills } from "@/lib/courseWorkspace/copilot";
import { COPILOT_MAX_SKILL_UPLOAD_BYTES, CopilotSkillPackageError, parseCopilotSkillPackage } from "@/lib/copilot/skillPackage";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    return Response.json({ skills: await listCopilotSkills(user, courseId) });
  } catch (error) {
    if (error instanceof CopilotError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
    return Response.json({ error: "Skill 加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
    const form = await readBoundedMultipartFormData(request, COPILOT_MAX_SKILL_UPLOAD_BYTES + 1024 * 1024);
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择 Skill 文件" }, { status: 400 });
    const parsed = await parseCopilotSkillPackage(file);
    const skill = await db.copilotSkill.create({
      data: { courseId, uploadedById: user.id, ...parsed },
      select: { id: true, name: true, description: true, status: true, originalName: true, fileSize: true, instructions: true, createdAt: true, updatedAt: true }
    });
    return Response.json({ skill }, { status: 201 });
  } catch (error) {
    if (error instanceof CopilotSkillPackageError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Skill 上传失败" }, { status: 400 });
  }
}
