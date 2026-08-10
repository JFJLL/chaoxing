import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteDriveFileFromStorage, streamDriveFile } from "@/lib/modules/driveFiles";
import { requireDriveFileOwner, requireDriveFileReadable } from "@/lib/modules/drivePermissions";
import { requireTeacher } from "@/lib/permissions";
import { assertDriveMoveAllowed } from "@/lib/copilot/files";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  try {
    const file = await requireDriveFileReadable(user, fileId);
    if (request.nextUrl.searchParams.get("download")) return streamDriveFile(fileId, "attachment");
    if (request.nextUrl.searchParams.get("preview")) return streamDriveFile(fileId, "inline");
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
    requireTeacher(user);
    const file = await requireDriveFileOwner(user, fileId);
    const nextParentId = Object.prototype.hasOwnProperty.call(body, "parentId") ? body.parentId ?? null : file.parentId;
    await assertDriveMoveAllowed(user.id, file.id, nextParentId);
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
    requireTeacher(user);
    const file = await requireDriveFileOwner(user, fileId);
    const activeFiles = await db.driveFile.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, parentId: true, kind: true, name: true, mimeType: true, path: true }
    });
    const children = new Map<string, string[]>();
    for (const item of activeFiles) {
      if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item.id]);
    }
    const ids = new Set<string>([file.id]);
    const queue = [file.id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const childId of children.get(current) ?? []) {
        if (ids.has(childId)) continue;
        ids.add(childId);
        queue.push(childId);
      }
    }
    const deletedFiles = activeFiles.filter((item) => ids.has(item.id));
    const protectedCourse = await db.course.findFirst({
      where: {
        ownerId: user.id,
        driveRootFolderId: { in: [...ids] }
      },
      select: { id: true, title: true }
    });
    if (protectedCourse) {
      return NextResponse.json({
        code: "COURSE_DRIVE_ROOT_PROTECTED",
        error: `“${protectedCourse.title}”正在使用此文件夹作为课程云盘，不能从普通云盘删除`
      }, { status: 409 });
    }
    const noticeReferences = await db.announcementAttachment.count({ where: { driveFileId: { in: [...ids] } } });
    if (noticeReferences) {
      return NextResponse.json({
        code: "DRIVE_FILE_IN_NOTICE",
        error: `文件已被课程通知引用（共 ${noticeReferences} 处），请先移除通知附件`
      }, { status: 409 });
    }
    const deletedAt = new Date();
    await db.$transaction([
      db.resource.deleteMany({ where: { driveFileId: { in: [...ids] } } }),
      db.driveShare.deleteMany({ where: { fileId: { in: [...ids] } } }),
      db.driveFile.updateMany({ where: { id: { in: [...ids] } }, data: { deletedAt } })
    ]);
    const cleanup = await Promise.allSettled(deletedFiles.map(deleteDriveFileFromStorage));
    const cleanupPending = cleanup.filter((result) => result.status === "rejected").length;
    if (cleanupPending) {
      console.error("[drive-delete-cleanup]", cleanup
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason));
    }
    return NextResponse.json(
      { ok: true, deletedCount: ids.size, cleanupPending },
      { status: cleanupPending ? 202 : 200 }
    );
  } catch (error) {
    console.error("[drive-delete]", error);
    const forbidden = error instanceof Error && error.message === "无权管理文件";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: forbidden ? 403 : 502 }
    );
  }
}
