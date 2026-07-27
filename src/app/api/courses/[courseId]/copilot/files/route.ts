import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertUploadSize } from "@/lib/storage";
import { listCourseCopilotFiles, storeCourseConversationUpload } from "@/lib/copilot/files";

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
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "请先选择课程资料" }, { status: 400 });
  try {
    assertUploadSize(file.size);
    const driveFile = await storeCourseConversationUpload(user, courseId, file);
    return NextResponse.json({ file: driveFile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "对话文件上传失败" }, { status: 400 });
  }
}
