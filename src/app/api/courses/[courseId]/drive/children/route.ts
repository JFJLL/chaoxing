import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { listCourseDriveChildren } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const parentId = request.nextUrl.searchParams.get("parentId");
    return NextResponse.json(await listCourseDriveChildren(user, courseId, parentId));
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
