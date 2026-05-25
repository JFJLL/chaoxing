import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ messageId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { messageId } = await context.params;
  const body = (await request.json()) as { read?: boolean; archive?: boolean };
  await db.message.updateMany({
    where: { id: messageId, OR: [{ receiverId: user.id }, { senderId: user.id }] },
    data: {
      readAt: body.read === undefined ? undefined : body.read ? new Date() : null,
      archivedAt: body.archive === undefined ? undefined : body.archive ? new Date() : null
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { messageId } = await context.params;
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ ok: true });
  await db.message.update({
    where: { id: messageId },
    data: message.senderId === user.id ? { deletedBySenderAt: new Date() } : { deletedByReceiverAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
