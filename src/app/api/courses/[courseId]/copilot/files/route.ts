import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertUploadSize } from "@/lib/storage";
import { requireCourseOwner } from "@/lib/permissions";
import { listCourseCopilotFiles, storeDriveUpload } from "@/lib/copilot/files";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    return NextResponse.json({ files: await listCourseCopilotFiles(user, courseId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问课程文件" }, { status: 403 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  let course: Awaited<ReturnType<typeof requireCourseOwner>>;
  try {
    course = await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  if (!course.copilotFolderId) {
    return NextResponse.json({ code: "COPILOT_FOLDER_REQUIRED", error: "请先在 Copilot 设置中绑定课程云盘文件夹" }, { status: 409 });
  }
  const copilotFolder = await db.driveFile.findFirst({
    where: { id: course.copilotFolderId, kind: "folder", deletedAt: null },
    select: { ownerId: true }
  });
  if (!copilotFolder) {
    return NextResponse.json({ code: "COPILOT_FOLDER_UNAVAILABLE", error: "课程云盘文件夹已失效，请重新绑定" }, { status: 409 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "请先选择课程资料" }, { status: 400 });
  try {
    assertUploadSize(file.size);
    const driveFile = await storeDriveUpload({ ownerId: copilotFolder.ownerId, parentId: course.copilotFolderId, file });
    const resource = await db.resource.create({
      data: { courseId, title: driveFile.name, type: "drive", driveFileId: driveFile.id }
    });
    return NextResponse.json({ file: driveFile, resource }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "课程资料上传失败" }, { status: 400 });
  }
}
