import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseOwner, requireTeacher } from "@/lib/permissions";
import { requireDriveFileOwner, requireDriveFileReadable } from "@/lib/modules/drivePermissions";
import { storeDriveFile } from "@/lib/modules/driveFiles";

export const runtime = "nodejs";

function errorResponse(error: unknown, fallback: string, status = 500) {
  console.error("[drive]", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const parentId = request.nextUrl.searchParams.get("parentId");
  if (!isTeacher(user)) {
    return NextResponse.json({ error: "需要教师权限" }, { status: 403 });
  }

  const files = await db.driveFile.findMany({
    where: { ownerId: user.id, parentId: parentId || null, deletedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }]
  });
  return NextResponse.json({ files });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  try {
    requireTeacher(user);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "需要教师权限" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("file");
      const parentId = form.get("parentId");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "请先选择要上传的文件" }, { status: 400 });
      if (typeof parentId === "string" && parentId) {
        await requireDriveFileOwner(user, parentId);
      }
      const path = await storeDriveFile({
        ownerId: user.id,
        fileName: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type || null
      });
      const record = await db.driveFile.create({
        data: {
          ownerId: user.id,
          parentId: typeof parentId === "string" && parentId ? parentId : null,
          name: file.name,
          kind: "file",
          mimeType: file.type || null,
          size: file.size,
          path
        }
      });
      return NextResponse.json({ file: record }, { status: 201 });
    } catch (error) {
      return errorResponse(error, "上传失败");
    }
  }

  try {
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
  } catch (error) {
    return errorResponse(error, "云盘操作失败");
  }
}
