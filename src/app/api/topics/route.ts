import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const q = request.nextUrl.searchParams.get("q") || "";
  const folderId = request.nextUrl.searchParams.get("folderId");
  const [folders, topics] = await Promise.all([
    db.topicFolder.findMany({ where: { ownerId: user.id, parentId: folderId || null, deletedAt: null, title: { contains: q } } }),
    db.topic.findMany({ where: { ownerId: user.id, folderId: folderId || undefined, deletedAt: null, title: { contains: q } }, include: { sections: true, resources: true } })
  ]);
  return NextResponse.json({ folders, topics });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = (await request.json()) as { type: "folder" | "topic"; title: string; folderId?: string; description?: string };
  if (body.type === "folder") {
    const folder = await db.topicFolder.create({ data: { title: body.title, ownerId: user.id, parentId: body.folderId || null } });
    return NextResponse.json({ folder }, { status: 201 });
  }
  const topic = await db.topic.create({
    data: {
      title: body.title,
      description: body.description || "",
      ownerId: user.id,
      folderId: body.folderId || null,
      sections: { create: [{ title: "正文", body: body.description || "专题内容", order: 1 }] }
    },
    include: { sections: true }
  });
  return NextResponse.json({ topic }, { status: 201 });
}
