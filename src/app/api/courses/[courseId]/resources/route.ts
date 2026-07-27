import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertUploadSize } from "@/lib/storage";
import { CourseDriveError } from "@/lib/courseDrive/service";
import { publishCourseResourceUpload } from "@/lib/courseWorkspace/courseResources";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请先选择课程资料" }, { status: 400 });
  }
  try {
    assertUploadSize(file.size);
    const resource = await publishCourseResourceUpload(user, courseId, file);
    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    const status = error instanceof CourseDriveError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "课程资料上传失败" },
      { status }
    );
  }
}
