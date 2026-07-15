import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { normalizeNoticePublishAt } from "@/lib/teaching/notices";

type RouteContext = { params: Promise<{ courseId: string; noticeId: string }> };

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "WITHDRAWN"]).optional(),
  publishAt: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional()
});

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, noticeId } = await context.params;
  await requireCourseOwner(user, courseId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "通知内容无效" }, { status: 400 });
  const existing = await db.announcement.findFirst({
    where: { id: noticeId, courseId },
    include: { author: { select: { name: true } }, reads: { where: { user: { enrollments: { some: { courseId } } } }, select: { userId: true, readAt: true } } }
  });
  if (!existing) return NextResponse.json({ error: "通知不存在" }, { status: 404 });
  const notice = await db.announcement.update({
    where: { id: noticeId },
    data: {
      ...parsed.data,
      publishAt: normalizeNoticePublishAt({
        nextStatus: parsed.data.status,
        previousStatus: existing.status,
        requestedPublishAt: parsed.data.publishAt
      })
    }
  });
  return NextResponse.json({
    notice: {
      ...notice,
      authorName: existing.author.name,
      readAt: null,
      readCount: existing.reads.length,
      readerIds: existing.reads.map((read) => read.userId)
    }
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, noticeId } = await context.params;
  await requireCourseOwner(user, courseId);
  const result = await db.announcement.updateMany({ where: { id: noticeId, courseId }, data: { status: "WITHDRAWN" } });
  return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "通知不存在" }, { status: 404 });
}
