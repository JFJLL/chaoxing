import type { Prisma, PrismaClient } from "@prisma/client";
import type { GeneratedCourseOutline } from "@/types/course";
import { db } from "@/lib/db";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function joinList(values: string[]) {
  return values.filter(Boolean).join("\n");
}

export async function applyOutlineToCourse(input: {
  courseId: string;
  outline: GeneratedCourseOutline;
  actorId?: string;
  tx?: Prisma.TransactionClient | TransactionClient;
}) {
  const client = input.tx ?? db;

  await client.chapter.deleteMany({ where: { courseId: input.courseId } });

  for (const [chapterIndex, chapter] of input.outline.chapters.entries()) {
    await client.chapter.create({
      data: {
        courseId: input.courseId,
        title: chapter.title,
        summary: chapter.summary,
        order: chapter.order || chapterIndex + 1,
        lessons: {
          create: chapter.lessons.map((lesson, lessonIndex) => ({
            title: lesson.title,
            summary: lesson.summary,
            order: lesson.order || lessonIndex + 1,
            estimatedMinutes: lesson.estimatedMinutes,
            keyPoints: joinList(lesson.keyPoints),
            activities: joinList(lesson.suggestedActivities),
            assessments: joinList(lesson.assessmentPrompts)
          }))
        }
      }
    });
  }

  if (input.actorId) {
    await client.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "apply_outline",
        entity: "Course",
        entityId: input.courseId,
        metadata: JSON.stringify({ title: input.outline.title, chapters: input.outline.chapters.length })
      }
    });
  }
}
