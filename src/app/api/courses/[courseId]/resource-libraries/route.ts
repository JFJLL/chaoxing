import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { RESOURCE_LIBRARY_PURPOSES, type ResourceLibraryKind } from "@/lib/courseDrive/constants";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { listCourseDrivePicker, requireCourseDriveTarget } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseAccess(user, courseId);
    const bindings = await db.courseDriveBinding.findMany({
      where: { courseId, purpose: { in: Object.values(RESOURCE_LIBRARY_PURPOSES) } },
      include: { folder: true }
    });
    const visibleItems = await listCourseDrivePicker(user, courseId);
    const visibleByParent = new Map<string, typeof visibleItems>();
    for (const item of visibleItems) {
      if (!item.parentId) continue;
      visibleByParent.set(item.parentId, [...(visibleByParent.get(item.parentId) ?? []), item]);
    }
    const countVisibleFiles = (folderId: string) => {
      let count = 0;
      const seen = new Set<string>();
      const queue = [folderId];
      while (queue.length) {
        const current = queue.shift()!;
        if (seen.has(current)) continue;
        seen.add(current);
        for (const item of visibleByParent.get(current) ?? []) {
          if (item.kind === "folder") queue.push(item.id);
          else count += 1;
        }
      }
      return count;
    };
    const libraries = [];
    for (const [kind, purpose] of Object.entries(RESOURCE_LIBRARY_PURPOSES) as Array<[ResourceLibraryKind, string]>) {
      const binding = bindings.find((item) => item.purpose === purpose);
      if (!binding || binding.folder.deletedAt) continue;
      try {
        await requireCourseDriveTarget(user, courseId, binding.folderId);
      } catch {
        continue;
      }
      libraries.push({
        kind,
        folderId: binding.folderId,
        name: binding.folder.name,
        count: countVisibleFiles(binding.folderId)
      });
    }
    return NextResponse.json({ libraries });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
