import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import { assertAnnouncementAttachmentFiles, listCourseDrivePicker } from "@/lib/courseDrive/service";

type RouteContext = { params: Promise<{ courseId: string }> };

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  publishAt: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
  attachmentIds: z.array(z.string().min(1).max(200)).max(20).default([]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const now = new Date();
  const notices = await db.announcement.findMany({
    where: {
      courseId,
      ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: now } }] })
    },
    include: {
      author: { select: { id: true, name: true } },
      reads: { where: { userId: user.id }, select: { readAt: true } },
      _count: { select: { reads: true } },
      attachments: { include: { driveFile: { select: { id: true, name: true, mimeType: true, size: true, deletedAt: true } } } }
    },
    orderBy: [{ pinned: "desc" }, { publishAt: "desc" }, { createdAt: "desc" }]
  });
  if (canManage) return NextResponse.json({ notices });
  const visibleFiles = await listCourseDrivePicker(user, courseId);
  const visibleIds = new Set(visibleFiles.filter((file) => file.kind !== "folder").map((file) => file.id));
  return NextResponse.json({
    notices: notices.map((notice) => ({
      ...notice,
      attachments: notice.attachments.filter((attachment) => !attachment.driveFile.deletedAt && visibleIds.has(attachment.driveFileId))
    }))
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseManager(user, courseId);
  const parsed = noticeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "通知内容不完整" }, { status: 400 });
  let files;
  try {
    files = await assertAnnouncementAttachmentFiles(user, courseId, parsed.data.attachmentIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "通知文件无效" }, { status: 400 });
  }
  const notice = await db.announcement.create({
    data: {
      courseId,
      authorId: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      status: parsed.data.status,
      publishAt: parsed.data.status === "PUBLISHED" ? parsed.data.publishAt ? new Date(parsed.data.publishAt) : new Date() : parsed.data.publishAt ? new Date(parsed.data.publishAt) : null,
      pinned: parsed.data.pinned ?? false,
      attachments: { create: files.map((file) => ({ driveFileId: file.id, nameSnapshot: file.name })) }
    },
    include: { attachments: { include: { driveFile: { select: { id: true, name: true, mimeType: true, size: true } } } } }
  });
  return NextResponse.json({
    notice: { ...notice, authorName: user.name, readAt: null, readCount: 0, readerIds: [] }
  }, { status: 201 });
}
