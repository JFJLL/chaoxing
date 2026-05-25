import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { streamDriveFile } from "@/lib/modules/driveFiles";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  await requireUser();
  const { fileId } = await context.params;
  if (request.nextUrl.searchParams.get("download")) return streamDriveFile(fileId);
  const file = await db.driveFile.findUnique({ where: { id: fileId }, include: { shares: true } });
  return file ? NextResponse.json({ file }) : NextResponse.json({ error: "文件不存在" }, { status: 404 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  const body = (await request.json()) as { name?: string; parentId?: string | null };
  const file = await db.driveFile.updateMany({ where: { id: fileId, ownerId: user.id }, data: { name: body.name, parentId: body.parentId } });
  return NextResponse.json({ ok: file.count > 0 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  await db.driveFile.updateMany({ where: { id: fileId, ownerId: user.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
