import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { sessionId } = await context.params;
  const body = (await request.json()) as { body: string };
  const message = await db.liveChatMessage.create({ data: { sessionId, userId: user.id, body: body.body } });
  return NextResponse.json({ message }, { status: 201 });
}
