import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await requireUser();
  const { groupId } = await context.params;
  const group = await db.group.findUnique({ where: { id: groupId }, include: { members: { include: { user: true } }, posts: { include: { author: true, comments: { include: { author: true } } } }, files: true } });
  return group ? NextResponse.json({ group }) : NextResponse.json({ error: "小组不存在" }, { status: 404 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await requireUser();
  const { groupId } = await context.params;
  const body = (await request.json()) as { name?: string; description?: string; isOpen?: boolean };
  const group = await db.group.update({ where: { id: groupId }, data: body });
  return NextResponse.json({ group });
}
