import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { requireDriveFileOwner, requireDriveFileReadable } from "@/lib/modules/drivePermissions";
import { getUploadDir } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const parentId = request.nextUrl.searchParams.get("parentId");
  const files = await db.driveFile.findMany({
    where: { ownerId: user.id, parentId: parentId || null, deletedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }]
  });
  return NextResponse.json({ files });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const parentId = form.get("parentId");
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    if (typeof parentId === "string" && parentId) {
      await requireDriveFileOwner(user, parentId);
    }
    const dir = join(getUploadDir(), "drive");
    await mkdir(dir, { recursive: true });
    const idPrefix = `${Date.now()}-${file.name}`;
    const filePath = join(dir, idPrefix);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    const record = await db.driveFile.create({
      data: {
        ownerId: user.id,
        parentId: typeof parentId === "string" && parentId ? parentId : null,
        name: file.name,
        kind: "file",
        mimeType: file.type || null,
        size: file.size,
        path: filePath
      }
    });
    return NextResponse.json({ file: record }, { status: 201 });
  }

  const body = (await request.json()) as { name: string; parentId?: string; courseId?: string; driveFileId?: string };
  if (body.courseId && body.driveFileId) {
    const driveFile = await requireDriveFileReadable(user, body.driveFileId);
    await requireCourseOwner(user, body.courseId);
    const resource = await db.resource.create({ data: { courseId: body.courseId, title: driveFile?.name || "云盘资料", type: "drive", driveFileId: body.driveFileId } });
    return NextResponse.json({ resource }, { status: 201 });
  }
  if (body.parentId) {
    await requireDriveFileOwner(user, body.parentId);
  }
  const folder = await db.driveFile.create({ data: { ownerId: user.id, parentId: body.parentId || null, name: body.name, kind: "folder" } });
  return NextResponse.json({ file: folder }, { status: 201 });
}
