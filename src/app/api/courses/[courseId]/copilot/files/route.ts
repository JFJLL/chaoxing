import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  COPILOT_MAX_UPLOAD_BYTES,
  listCourseCopilotFiles,
  storeCourseConversationUpload
} from "@/lib/copilot/files";
import { ImportRequestBodyError, readBoundedMultipartFormData } from "@/lib/imports/importUpload";

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
  let form: FormData;
  try {
    form = await readBoundedMultipartFormData(request, COPILOT_MAX_UPLOAD_BYTES + 1024 * 1024);
  } catch (error) {
    if (error instanceof ImportRequestBodyError && error.reason === "too_large") {
      return NextResponse.json({ error: "文件不能超过 255MB" }, { status: 413 });
    }
    return NextResponse.json({ error: "请使用 multipart/form-data 上传文件" }, { status: 400 });
  }
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "请先选择课程资料" }, { status: 400 });
  try {
    if (file.size > COPILOT_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "文件不能超过 255MB" }, { status: 413 });
    }
    const driveFile = await storeCourseConversationUpload(user, courseId, file);
    return NextResponse.json({ file: driveFile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "对话文件上传失败" }, { status: 400 });
  }
}
