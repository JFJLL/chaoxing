import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { storeDriveUpload } from "@/lib/copilot/files";
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
      const file = form.get("file");
      const parentId = form.get("parentId");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "请先选择要上传的文件" }, { status: 400 });
      }
      if (typeof parentId !== "string" || !parentId) {
        return NextResponse.json({ error: "上传位置无效" }, { status: 400 });
      }
      const parent = await requireCourseDriveMutationFolder(user, courseId, parentId);
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
