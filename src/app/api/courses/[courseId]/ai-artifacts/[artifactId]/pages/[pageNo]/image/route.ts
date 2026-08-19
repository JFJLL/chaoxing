import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string; pageNo: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId, pageNo } = await context.params;
  await requireCourseAccess(user, courseId);
  const number = Number(pageNo);
  if (!Number.isInteger(number) || number < 1 || number > 200) {
    return NextResponse.json({ error: "页面编号无效" }, { status: 400 });
  }
  const page = await db.imageGenerationPage.findFirst({
    where: { pageNo: number, batch: { artifactId, artifact: { courseId } }, status: "SUCCEEDED" },
    select: { imagePath: true }
  });
  if (!page?.imagePath) return NextResponse.json({ error: "生成页面尚不可用" }, { status: 404 });
  try {
    const bytes = await readFile(page.imagePath);
    return new NextResponse(bytes, {
      headers: { "content-type": "image/png", "cache-control": "private, no-store" }
    });
  } catch {
    return NextResponse.json({ error: "生成页面文件不存在" }, { status: 404 });
  }
}
