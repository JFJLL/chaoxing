import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const publishSchema = z.object({
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"])
});

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const parsed = publishSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "课程状态无效" }, { status: 400 });
  }

  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const course = await db.course.update({
    where: { id: courseId },
    data: { status: parsed.data.status }
  });
  return NextResponse.json({ course });
}
