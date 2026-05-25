import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  const groups = await db.group.findMany({ include: { members: true, posts: { include: { author: true, comments: true } }, files: true } });
  return NextResponse.json({ groups: groups.map((group) => ({ ...group, joined: group.members.some((member) => member.userId === user.id) })) });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = (await request.json()) as { name: string; description?: string };
  const group = await db.group.create({ data: { name: body.name, description: body.description || "", members: { create: { userId: user.id, role: "owner" } } } });
  return NextResponse.json({ group }, { status: 201 });
}
