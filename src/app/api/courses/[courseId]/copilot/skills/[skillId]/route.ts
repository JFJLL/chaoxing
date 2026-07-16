import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; skillId: string }> };
const statusSchema = z.object({ status: z.enum(["ENABLED", "DISABLED"]) }).strict();

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, skillId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Skill 状态无效" }, { status: 400 });
    const existing = await db.copilotSkill.findFirst({ where: { id: skillId, courseId } });
    if (!existing) return Response.json({ error: "Skill 不存在" }, { status: 404 });
    const skill = await db.$transaction(async (tx) => {
      if (parsed.data.status === "DISABLED") {
        await tx.courseAiConversation.updateMany({ where: { activeSkillId: skillId }, data: { activeSkillId: null } });
      }
      return tx.copilotSkill.update({ where: { id: skillId }, data: { status: parsed.data.status } });
    });
    return Response.json({ skill });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Skill 更新失败" }, { status: 403 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, skillId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
    const skill = await db.copilotSkill.findFirst({ where: { id: skillId, courseId } });
    if (!skill) return Response.json({ ok: true });
    if (skill.status !== "DISABLED") return Response.json({ error: "请先停用 Skill 再删除" }, { status: 409 });
    await db.copilotSkill.delete({ where: { id: skillId } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Skill 删除失败" }, { status: 403 });
  }
}
