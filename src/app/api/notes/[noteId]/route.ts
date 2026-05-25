import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ noteId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { noteId } = await context.params;
  const body = (await request.json()) as { title?: string; body?: string; tags?: string[]; courseId?: string; lessonId?: string };
  await db.$transaction(async (tx) => {
    await tx.note.updateMany({ where: { id: noteId, ownerId: user.id }, data: { title: body.title, body: body.body, courseId: body.courseId, lessonId: body.lessonId } });
    if (body.tags) {
      await tx.noteTag.deleteMany({ where: { noteId } });
      await tx.noteTag.createMany({ data: body.tags.map((name) => ({ noteId, ownerId: user.id, name })) });
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { noteId } = await context.params;
  await db.note.updateMany({ where: { id: noteId, ownerId: user.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
