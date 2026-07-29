import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import {
  deleteCourseDriveItem,
  requireCourseDriveMutationTarget,
  updateCourseDriveItem
} from "@/lib/courseDrive/service";
import { deleteDriveFileFromStorage, streamDriveFile } from "@/lib/modules/driveFiles";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ courseId: string; fileId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, fileId } = await context.params;
  try {
    const contextTarget = await requireCourseDriveMutationTarget(user, courseId, fileId);
    if (request.nextUrl.searchParams.get("download")) return streamDriveFile(contextTarget.target.id, "attachment");
    if (request.nextUrl.searchParams.get("preview")) return streamDriveFile(contextTarget.target.id, "inline");
    return NextResponse.json({ file: contextTarget.target });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, fileId } = await context.params;
  const parsed = z.object({
    name: z.string().trim().min(1).optional(),
    parentId: z.string().trim().min(1).nullable().optional()
  }).refine((value) => value.name !== undefined || value.parentId !== undefined, "没有可保存的修改")
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "文件修改无效" }, { status: 400 });
  }
  try {
    const file = await updateCourseDriveItem(user, courseId, fileId, parsed.data);
    return NextResponse.json({ file });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, fileId } = await context.params;
  try {
    const result = await deleteCourseDriveItem(user, courseId, fileId);
    const cleanup = await Promise.allSettled(result.deletedFiles.map(deleteDriveFileFromStorage));
    const cleanupPending = cleanup.filter((item) => item.status === "rejected").length;
    if (cleanupPending) {
      console.error("[course-drive-delete-cleanup]", cleanup
        .filter((item): item is PromiseRejectedResult => item.status === "rejected")
        .map((item) => item.reason));
    }
    return NextResponse.json(
      { ok: true, deletedCount: result.deletedCount, cleanupPending },
      { status: cleanupPending ? 202 : 200 }
    );
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
