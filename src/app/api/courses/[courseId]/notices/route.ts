import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseOwner } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string }> };

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  publishAt: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = user.role === "ADMIN" || course.ownerId === user.id;
  const now = new Date();
  const notices = await db.announcement.findMany({
    where: {
      courseId,
      ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: now } }] })
    },
    include: {
      author: { select: { id: true, name: true } },
      reads: { where: { userId: user.id }, select: { readAt: true } },
      _count: { select: { reads: true } }
    },
    orderBy: [{ pinned: "desc" }, { publishAt: "desc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({ notices });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseOwner(user, courseId);
  const parsed = noticeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "通知内容不完整" }, { status: 400 });
  const notice = await db.announcement.create({
    data: {
      courseId,
      authorId: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      status: parsed.data.status,
      publishAt: parsed.data.status === "PUBLISHED" ? parsed.data.publishAt ? new Date(parsed.data.publishAt) : new Date() : parsed.data.publishAt ? new Date(parsed.data.publishAt) : null,
      pinned: parsed.data.pinned ?? false
    }
  });
  return NextResponse.json({
    notice: { ...notice, authorName: user.name, readAt: null, readCount: 0, readerIds: [] }
  }, { status: 201 });
}
