import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/modules/groupPermissions";

type RouteContext = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { groupId } = await context.params;
  const body = (await request.json()) as { title?: string; body: string; postId?: string };
  try {
    await requireGroupMember(user, groupId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问小组" }, { status: 403 });
  }
  if (body.postId) {
    const post = await db.groupPost.findFirst({ where: { id: body.postId, groupId } });
    if (!post) return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    const comment = await db.groupComment.create({ data: { postId: body.postId, authorId: user.id, body: body.body } });
    return NextResponse.json({ comment }, { status: 201 });
  }
  const post = await db.groupPost.create({ data: { groupId, authorId: user.id, title: body.title || "小组讨论", body: body.body } });
  return NextResponse.json({ post }, { status: 201 });
}
