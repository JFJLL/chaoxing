import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireCourseOwner } from "@/lib/permissions";
import { bindCourseDriveRoot, ensureCourseDriveRoot, getCourseDriveRoot, listCourseDriveRootCandidates } from "@/lib/courseDrive/service";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";

type RouteContext = { params: Promise<{ courseId: string }> };

const mutationSchema = z.object({
  action: z.enum(["create", "bind"]).optional(),
  mode: z.enum(["create", "bind"]).optional(),
  folderId: z.string().trim().min(1).optional()
}).superRefine((value, context) => {
  const operation = value.action ?? value.mode;
  if (!operation) context.addIssue({ code: z.ZodIssueCode.custom, message: "缺少云盘操作" });
  if (operation === "bind" && !value.folderId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["folderId"], message: "请选择要绑定的文件夹" });
  }
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const root = await getCourseDriveRoot(user, courseId);
    const canBindRoot = await requireCourseOwner(user, courseId).then(() => true).catch(() => false);
    const folders = canBindRoot ? await listCourseDriveRootCandidates(user, courseId) : [];
    return NextResponse.json({ root, folders, canBindRoot });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "云盘设置无效" }, { status: 400 });
  }
  try {
    const operation = parsed.data.action ?? parsed.data.mode;
    if (operation === "create") {
      const root = await ensureCourseDriveRoot(user, courseId);
      return NextResponse.json({ root, rebound: false });
    }
    return NextResponse.json(await bindCourseDriveRoot(user, courseId, parsed.data.folderId!));
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const parsed = z.object({ folderId: z.string().trim().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择要绑定的文件夹" }, { status: 400 });
  try {
    return NextResponse.json(await bindCourseDriveRoot(user, courseId, parsed.data.folderId));
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
