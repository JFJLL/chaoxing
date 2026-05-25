import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { groupId } = await context.params;
  const body = (await request.json()) as { title?: string; body: string; postId?: string };
  if (body.postId) {
    const comment = await db.groupComment.create({ data: { postId: body.postId, authorId: user.id, body: body.body } });
    return NextResponse.json({ comment }, { status: 201 });
  }
  const post = await db.groupPost.create({ data: { groupId, authorId: user.id, title: body.title || "小组讨论", body: body.body } });
  return NextResponse.json({ post }, { status: 201 });
}
