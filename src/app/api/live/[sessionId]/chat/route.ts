import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireLiveParticipantOrHost } from "@/lib/modules/livePermissions";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { sessionId } = await context.params;
  let body: { body?: string };
  try {
    body = (await request.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
  }
  if (!body.body) return NextResponse.json({ error: "请输入聊天内容" }, { status: 400 });
  try {
    await requireLiveParticipantOrHost(user, sessionId);
  } catch {
    return NextResponse.json({ error: "无权参与直播聊天" }, { status: 403 });
  }
  const message = await db.liveChatMessage.create({ data: { sessionId, userId: user.id, body: body.body } });
  return NextResponse.json({ message }, { status: 201 });
}
