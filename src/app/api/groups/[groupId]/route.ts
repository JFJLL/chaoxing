import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireGroupMember, requireGroupOwner } from "@/lib/modules/groupPermissions";

type RouteContext = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { groupId } = await context.params;
  const group = await db.group.findUnique({ where: { id: groupId }, include: { members: { include: { user: true } }, posts: { include: { author: true, comments: { include: { author: true } } } }, files: true } });
  if (group && !group.isOpen) {
    try {
      await requireGroupMember(user, groupId);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问小组" }, { status: 403 });
    }
  }
  return group ? NextResponse.json({ group }) : NextResponse.json({ error: "小组不存在" }, { status: 404 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { groupId } = await context.params;
  const body = (await request.json()) as { name?: string; description?: string; isOpen?: boolean };
  try {
    await requireGroupOwner(user, groupId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理小组" }, { status: 403 });
  }
  const group = await db.group.update({ where: { id: groupId }, data: body });
  return NextResponse.json({ group });
}
