import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { RESOURCE_LIBRARY_PURPOSES, type ResourceLibraryKind } from "@/lib/courseDrive/constants";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { countFilesBelowFolder, ensureCoursePurposeFolder } from "@/lib/courseDrive/service";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; kind: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, kind } = await context.params;
  if (!(kind in RESOURCE_LIBRARY_PURPOSES)) {
    return NextResponse.json({ error: "资料库类型无效" }, { status: 404 });
  }
  try {
    const course = await requireCourseOwner(user, courseId);
    const libraryKind = kind as ResourceLibraryKind;
    const folder = await ensureCoursePurposeFolder(user, courseId, RESOURCE_LIBRARY_PURPOSES[libraryKind]);
    return NextResponse.json({
      library: {
        kind: libraryKind,
        folderId: folder.id,
        name: folder.name,
        count: await countFilesBelowFolder(course.ownerId, folder.id)
      }
    });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
