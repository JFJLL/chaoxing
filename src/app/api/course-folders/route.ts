import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTeacher } from "@/lib/permissions";

const courseFolderSchema = z.object({
  title: z.string().min(2, "文件夹名称至少 2 个字")
});

export async function GET() {
  const user = await requireUser();
  assertTeacher(user);
  const folders = await db.courseFolder.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { courses: true }
  });
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  assertTeacher(user);
  const parsed = courseFolderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors.title?.[0] ?? "文件夹名称无效" }, { status: 400 });
  }

  const folder = await db.courseFolder.create({
    data: {
      title: parsed.data.title,
      ownerId: user.id
    }
  });
  return NextResponse.json({ folder }, { status: 201 });
}
