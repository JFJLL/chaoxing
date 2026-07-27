import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { courseDriveErrorResponse } from "@/lib/courseDrive/http";
import { resolveCourseDriveAccess, setCourseDriveAccess } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string; fileId: string }> };
const accessSchema = z.object({ access: z.enum(["ALLOW", "DENY", "INHERIT"]) });

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, fileId } = await context.params;
  try {
    return NextResponse.json(await resolveCourseDriveAccess(user, courseId, fileId));
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, fileId } = await context.params;
  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "访问状态无效" }, { status: 400 });
  try {
    const rule = await setCourseDriveAccess(user, courseId, fileId, parsed.data.access);
    return NextResponse.json({ rule, effective: await resolveCourseDriveAccess(user, courseId, fileId) });
  } catch (error) {
    return courseDriveErrorResponse(error);
  }
}
