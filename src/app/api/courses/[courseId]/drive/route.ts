import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MAX_DRIVE_BATCH_FILES, storeDriveBatchUpload, storeDriveUpload } from "@/lib/copilot/files";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import {
  createCourseDriveFolder,
  requireCourseDriveMutationFolder
} from "@/lib/courseDrive/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const parentId = form.get("parentId");
      if (typeof parentId !== "string" || !parentId) {
        return NextResponse.json({ error: "上传位置无效" }, { status: 400 });
      }
      const parent = await requireCourseDriveMutationFolder(user, courseId, parentId);
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
          ownerId: parent.course.ownerId,
          parentId: parent.target.id,
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
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "请先选择要上传的文件" }, { status: 400 });
      }
      const record = await storeDriveUpload({
        ownerId: parent.course.ownerId,
        parentId: parent.target.id,
        file
      });
      return NextResponse.json(
        { file: record, storage: record.path?.startsWith("oss://") ? "oss" : "local" },
        { status: 201 }
      );
    }

    const parsed = z.object({
      name: z.string().trim().min(1, "请输入文件夹名称"),
      parentId: z.string().trim().min(1, "目标位置无效")
    }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "云盘操作无效" }, { status: 400 });
    }
    const folder = await createCourseDriveFolder(user, courseId, parsed.data.parentId, parsed.data.name);
    return NextResponse.json({ file: folder }, { status: 201 });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
