import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const q = request.nextUrl.searchParams.get("q") || "";
  const tag = request.nextUrl.searchParams.get("tag") || "";
  const courseId = request.nextUrl.searchParams.get("courseId") || undefined;
  const notes = await db.note.findMany({
    where: { ownerId: user.id, deletedAt: null, courseId, title: { contains: q }, tags: tag ? { some: { name: tag } } : undefined },
    include: { tags: true, course: true },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = (await request.json()) as { title: string; body: string; tags?: string[]; courseId?: string; lessonId?: string };
  const note = await db.note.create({
    data: {
      ownerId: user.id,
      title: body.title,
      body: body.body,
      courseId: body.courseId || null,
      lessonId: body.lessonId || null,
      tags: { create: (body.tags || []).map((name) => ({ name, ownerId: user.id })) }
    },
    include: { tags: true }
  });
  return NextResponse.json({ note }, { status: 201 });
}
