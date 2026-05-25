import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await requireUser();
  const { sessionId } = await context.params;
  const session = await db.liveSession.findUnique({ where: { id: sessionId }, include: { participants: { include: { user: true } }, messages: { include: { user: true } }, host: true } });
  return session ? NextResponse.json({ session }) : NextResponse.json({ error: "直播不存在" }, { status: 404 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { sessionId } = await context.params;
  const body = (await request.json()) as { action?: "start" | "end" | "join" | "leave"; title?: string; description?: string };
  if (body.action === "join") {
    await db.liveParticipant.upsert({ where: { sessionId_userId: { sessionId, userId: user.id } }, update: { joinedAt: new Date() }, create: { sessionId, userId: user.id, joinedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "leave") {
    await db.liveParticipant.updateMany({ where: { sessionId, userId: user.id }, data: { leftAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  const data = body.action === "start" ? { status: "LIVE", startsAt: new Date() } : body.action === "end" ? { status: "ENDED", endedAt: new Date() } : { title: body.title, description: body.description };
  const session = await db.liveSession.updateMany({ where: { id: sessionId, hostId: user.id }, data });
  return NextResponse.json({ ok: session.count > 0 });
}
