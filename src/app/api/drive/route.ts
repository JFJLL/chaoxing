import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseOwner, requireTeacher } from "@/lib/permissions";
import { requireDriveFileOwner } from "@/lib/modules/drivePermissions";
import { MAX_DRIVE_BATCH_FILES, storeDriveBatchUpload, storeDriveUpload } from "@/lib/copilot/files";
import { publishExistingDriveFileToCourse } from "@/lib/courseWorkspace/courseResources";

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
      const parentId = form.get("parentId");
      let resolvedParentId: string | null = null;
      if (typeof parentId === "string" && parentId) {
        const parent = await requireDriveFileOwner(user, parentId);
        if (parent.kind !== "folder") return NextResponse.json({ error: "目标位置不是文件夹" }, { status: 400 });
        resolvedParentId = parentId;
      }
      const batchFiles = form.getAll("files").filter((item): item is File => item instanceof File);
      if (batchFiles.length) {
        if (batchFiles.length > MAX_DRIVE_BATCH_FILES) {
          return NextResponse.json({ error: `一次最多上传 ${MAX_DRIVE_BATCH_FILES} 个文件` }, { status: 400 });
        }
        const paths = form.getAll("paths").map(String);
        if (paths.length && paths.length !== batchFiles.length) {
          return NextResponse.json({ error: "上传文件与路径数量不一致" }, { status: 400 });
        }
        const rawFolderName = form.get("folderName");
        const folderName = typeof rawFolderName === "string" ? rawFolderName : "";
        const result = await storeDriveBatchUpload({
          ownerId: user.id,
          parentId: resolvedParentId,
          folderName: folderName.trim() || undefined,
          items: batchFiles.map((file, index) => ({ file, path: paths[index] ?? "" }))
        });
        if (!result.files.length && result.failed.length) {
          return NextResponse.json({ error: "全部文件上传失败", failed: result.failed }, { status: 400 });
        }
        const storage = result.files.some((record) => !record.path?.startsWith("oss://")) ? "local" : "oss";
        return NextResponse.json({ folder: result.folder, files: result.files, failed: result.failed, storage }, { status: 201 });
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "请先选择要上传的文件" }, { status: 400 });
      const record = await storeDriveUpload({
        ownerId: user.id,
        parentId: resolvedParentId,
        file
      });
      return NextResponse.json({ file: record, storage: record.path?.startsWith("oss://") ? "oss" : "local" }, { status: 201 });
    } catch (error) {
      return errorResponse(error, "上传失败");
    }
  }

  try {
    const body = (await request.json()) as { name: string; parentId?: string; courseId?: string; driveFileId?: string };
    if (body.courseId && body.driveFileId) {
      const result = await publishExistingDriveFileToCourse(user, body.courseId, body.driveFileId);
      return NextResponse.json(result, { status: result.alreadyAttached ? 200 : 201 });
    }
    if (body.parentId) {
      const parent = await requireDriveFileOwner(user, body.parentId);
      if (parent.kind !== "folder") return NextResponse.json({ error: "目标位置不是文件夹" }, { status: 400 });
    }
    const folder = await db.driveFile.create({ data: { ownerId: user.id, parentId: body.parentId || null, name: body.name, kind: "folder" } });
    return NextResponse.json({ file: folder }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "云盘操作失败");
  }
}
