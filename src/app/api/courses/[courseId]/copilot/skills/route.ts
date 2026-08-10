import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { readBoundedMultipartFormData } from "@/lib/imports/importUpload";
import { CopilotError, listCopilotSkills } from "@/lib/courseWorkspace/copilot";
import { COPILOT_MAX_SKILL_UPLOAD_BYTES, CopilotSkillPackageError, parseCopilotSkillPackage } from "@/lib/copilot/skillPackage";
import { z } from "zod";
import { BoundedJsonBodyError, readBoundedJsonBody } from "@/lib/ai/requestGuards";

type RouteContext = { params: Promise<{ courseId: string }> };
const pastedSkillSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).optional(),
  prompt: z.string().trim().min(10).max(20_000)
}).strict();

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
    await requireCourseManager(user, courseId);
    if (request.headers.get("content-type")?.includes("application/json")) {
      let body: unknown;
      try {
        body = await readBoundedJsonBody(request, 48 * 1024);
      } catch (error) {
        if (error instanceof BoundedJsonBodyError && error.reason === "too_large") {
          return Response.json({ error: "Prompt 请求不能超过 48KB" }, { status: 413 });
        }
        return Response.json({ error: "Prompt 请求格式无效" }, { status: 400 });
      }
      const parsed = pastedSkillSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "请填写 2–40 字的 Skill 名称和至少 10 字的 Prompt" }, { status: 400 });
      const skill = await db.copilotSkill.create({
        data: {
          courseId,
          uploadedById: user.id,
          name: parsed.data.name,
          description: parsed.data.description || "教师粘贴的课程 Skill",
          instructions: parsed.data.prompt,
          originalName: "粘贴 Prompt",
          fileSize: Buffer.byteLength(parsed.data.prompt, "utf8")
        },
        select: { id: true, name: true, description: true, status: true, originalName: true, fileSize: true, instructions: true, createdAt: true, updatedAt: true }
      });
      return Response.json({ skill }, { status: 201 });
    }
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
