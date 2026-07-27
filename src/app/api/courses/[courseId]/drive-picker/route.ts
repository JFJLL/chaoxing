import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { listCourseDrivePicker } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const filter = request.nextUrl.searchParams.get("kind") ?? request.nextUrl.searchParams.get("type");
  try {
    const items = await listCourseDrivePicker(user, courseId, { documentsOnly: filter === "document" });
    return NextResponse.json({ items });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
