import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ topicId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { topicId } = await context.params;
  const body = (await request.json()) as { title?: string; description?: string; status?: string; sections?: Array<{ title: string; body: string; order: number }> };
  const topic = await db.topic.findFirst({ where: { id: topicId, ownerId: user.id } });
  if (!topic) return NextResponse.json({ error: "专题不存在" }, { status: 404 });
  await db.$transaction(async (tx) => {
    await tx.topic.update({ where: { id: topicId }, data: { title: body.title, description: body.description, status: body.status } });
    if (body.sections) {
      await tx.topicSection.deleteMany({ where: { topicId } });
      await tx.topicSection.createMany({ data: body.sections.map((section) => ({ ...section, topicId })) });
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { topicId } = await context.params;
  await db.topic.updateMany({ where: { id: topicId, ownerId: user.id }, data: { deletedAt: new Date() } });
  await db.topicFolder.updateMany({ where: { id: topicId, ownerId: user.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
