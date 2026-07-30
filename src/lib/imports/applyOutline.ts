import type { Prisma, PrismaClient } from "@prisma/client";
import type { CourseDirectoryNode, GeneratedCourseOutline } from "@/types/course";
import { db } from "@/lib/db";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type OutlineLessonInput = GeneratedCourseOutline["chapters"][number]["lessons"][number] & { id?: string };
type OutlineChapterInput = Omit<GeneratedCourseOutline["chapters"][number], "lessons"> & {
  id?: string;
  lessons: OutlineLessonInput[];
};

export type CourseOutlineSyncInput = {
  title?: string;
  chapters: OutlineChapterInput[];
};

function joinList(values: string[]) {
  return values.filter(Boolean).join("\n");
}

function splitList(value?: string | null) {
  return (value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function isTemporaryId(value: string | undefined, prefix: "chapter" | "lesson") {
  return Boolean(value?.startsWith(`${prefix}_`));
}

export class CourseOutlineSyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CourseOutlineSyncError";
  }
}

export class CourseOutlineConflictError extends CourseOutlineSyncError {
  constructor() {
    super("COURSE_OUTLINE_VERSION_CONFLICT", "课程目录已被其他教师更新，请刷新后重试");
    this.name = "CourseOutlineConflictError";
  }
}

function assertLessonCanBeDeleted(lesson: {
  title: string;
  _count: { resources: number; notes: number; progress: number };
}) {
  const { resources, notes, progress } = lesson._count;
  if (resources + notes + progress === 0) return;
  throw new CourseOutlineSyncError(
    "COURSE_OUTLINE_ITEM_REFERENCED",
    `课时“${lesson.title}”仍被 ${resources} 份资料、${notes} 条笔记、${progress} 条学习进度引用，不能删除`
  );
}

async function loadDirectory(client: Prisma.TransactionClient | TransactionClient, courseId: string): Promise<CourseDirectoryNode[]> {
  const chapters = await client.chapter.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } }
  });
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary ?? "",
    order: chapter.order,
    lessons: chapter.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary ?? "",
      order: lesson.order,
      estimatedMinutes: lesson.estimatedMinutes ?? 30,
      keyPoints: splitList(lesson.keyPoints),
      suggestedActivities: splitList(lesson.activities),
      assessmentPrompts: splitList(lesson.assessments)
    }))
  }));
}

type SyncCourseOutlineRequest = {
  courseId: string;
  outline: CourseOutlineSyncInput;
  actorId?: string;
  expectedOutlineVersion: number;
  tx?: Prisma.TransactionClient | TransactionClient;
};

async function syncCourseOutlineInTransaction(
  input: Omit<SyncCourseOutlineRequest, "tx">,
  client: Prisma.TransactionClient | TransactionClient
) {
  const claimed = await client.course.updateMany({
    where: { id: input.courseId, outlineVersion: input.expectedOutlineVersion },
    data: { outlineVersion: { increment: 1 } }
  });
  if (claimed.count !== 1) throw new CourseOutlineConflictError();

  const existingChapters = await client.chapter.findMany({
    where: { courseId: input.courseId },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: { _count: { select: { resources: true, notes: true, progress: true } } }
      }
    }
  });
  const existingChapterById = new Map(existingChapters.map((chapter) => [chapter.id, chapter]));
  const existingLessonById = new Map(existingChapters.flatMap((chapter) => chapter.lessons.map((lesson) => [lesson.id, lesson] as const)));
  const usedChapterIds = new Set<string>();

  for (const [chapterIndex, chapterInput] of input.outline.chapters.entries()) {
    const chapter = chapterInput.id ? existingChapterById.get(chapterInput.id) : undefined;
    if (chapterInput.id && !chapter && !isTemporaryId(chapterInput.id, "chapter")) {
      throw new CourseOutlineSyncError("COURSE_OUTLINE_ITEM_INVALID", "课程目录包含不属于当前课程的章节 ID");
    }

    let chapterId: string;
    if (chapter) {
      chapterId = chapter.id;
      usedChapterIds.add(chapter.id);
      await client.chapter.update({
        where: { id: chapter.id },
        data: {
          title: chapterInput.title,
          summary: chapterInput.summary,
          order: chapterInput.order || chapterIndex + 1
        }
      });
    } else {
      const created = await client.chapter.create({
        data: {
          courseId: input.courseId,
          title: chapterInput.title,
          summary: chapterInput.summary,
          order: chapterInput.order || chapterIndex + 1
        }
      });
      chapterId = created.id;
      usedChapterIds.add(created.id);
    }

    const existingLessons = chapter?.lessons ?? [];
    const usedLessonIds = new Set<string>();
    for (const [lessonIndex, lessonInput] of chapterInput.lessons.entries()) {
      const lesson = lessonInput.id ? existingLessonById.get(lessonInput.id) : undefined;
      if (lessonInput.id && !lesson && !isTemporaryId(lessonInput.id, "lesson")) {
        throw new CourseOutlineSyncError("COURSE_OUTLINE_ITEM_INVALID", "课程目录包含不属于当前课程的课时 ID");
      }
      if (lesson && lesson.chapterId !== chapterId) {
        throw new CourseOutlineSyncError("COURSE_OUTLINE_ITEM_INVALID", "不能把已有课时静默移动到其他章节");
      }

      const data = {
        title: lessonInput.title,
        summary: lessonInput.summary,
        order: lessonInput.order || lessonIndex + 1,
        estimatedMinutes: lessonInput.estimatedMinutes,
        keyPoints: joinList(lessonInput.keyPoints),
        activities: joinList(lessonInput.suggestedActivities),
        assessments: joinList(lessonInput.assessmentPrompts)
      };
      if (lesson) {
        usedLessonIds.add(lesson.id);
        await client.lesson.update({ where: { id: lesson.id }, data });
      } else {
        const created = await client.lesson.create({ data: { chapterId, ...data } });
        usedLessonIds.add(created.id);
      }
    }

    for (const lesson of existingLessons) {
      if (usedLessonIds.has(lesson.id)) continue;
      assertLessonCanBeDeleted(lesson);
      await client.lesson.delete({ where: { id: lesson.id } });
    }
  }

  for (const chapter of existingChapters) {
    if (usedChapterIds.has(chapter.id)) continue;
    for (const lesson of chapter.lessons) assertLessonCanBeDeleted(lesson);
    await client.chapter.delete({ where: { id: chapter.id } });
  }

  if (input.actorId) {
    await client.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "sync_outline",
        entity: "Course",
        entityId: input.courseId,
        metadata: JSON.stringify({ title: input.outline.title, chapters: input.outline.chapters.length })
      }
    });
  }

  return {
    outlineVersion: input.expectedOutlineVersion + 1,
    chapters: await loadDirectory(client, input.courseId)
  };
}

export async function syncCourseOutline(input: SyncCourseOutlineRequest) {
  const { tx, ...request } = input;
  if (tx) return syncCourseOutlineInTransaction(request, tx);
  return db.$transaction((transaction) => syncCourseOutlineInTransaction(request, transaction));
}

export const applyOutlineToCourse = syncCourseOutline;
