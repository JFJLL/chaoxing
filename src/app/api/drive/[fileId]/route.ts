import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { streamDriveFile } from "@/lib/modules/driveFiles";
import { requireDriveFileOwner, requireDriveFileReadable } from "@/lib/modules/drivePermissions";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  try {
    const file = await requireDriveFileReadable(user, fileId);
    if (request.nextUrl.searchParams.get("download")) return streamDriveFile(fileId);
    return NextResponse.json({ file });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问文件" }, { status: 403 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  const body = (await request.json()) as { name?: string; parentId?: string | null };
  try {
    const file = await requireDriveFileOwner(user, fileId);
    if (body.parentId) await requireDriveFileOwner(user, body.parentId);
    const updated = await db.driveFile.update({
      where: { id: file.id },
      data: { name: body.name, parentId: body.parentId }
    });
    return NextResponse.json({ file: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理文件" }, { status: 403 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  try {
    const file = await requireDriveFileOwner(user, fileId);
    await db.driveFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理文件" }, { status: 403 });
  }
}
