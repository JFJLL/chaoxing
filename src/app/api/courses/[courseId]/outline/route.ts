import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import type { CourseDirectoryNode } from "@/types/course";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const lessonSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  summary: z.string().default(""),
  order: z.number().int().positive(),
  estimatedMinutes: z.number().int().min(1).default(30),
  keyPoints: z.array(z.string()).default([]),
  suggestedActivities: z.array(z.string()).default([]),
  assessmentPrompts: z.array(z.string()).default([])
});

const chapterSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  summary: z.string().default(""),
  order: z.number().int().positive(),
  lessons: z.array(lessonSchema).default([])
});

const outlineSchema = z.object({
  chapters: z.array(chapterSchema)
});

function splitList(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);

  const chapters = await db.chapter.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" }
      }
    }
  });

  const directory: CourseDirectoryNode[] = chapters.map((chapter) => ({
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

  return NextResponse.json({ chapters: directory });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseOwner(user, courseId);
  const body = outlineSchema.parse(await request.json());

  await db.$transaction(async (tx) => {
    await tx.chapter.deleteMany({ where: { courseId } });
    for (const [chapterIndex, chapter] of body.chapters.entries()) {
      await tx.chapter.create({
        data: {
          courseId,
          title: chapter.title,
          summary: chapter.summary,
          order: chapterIndex + 1,
          lessons: {
            create: chapter.lessons.map((lesson, lessonIndex) => ({
              title: lesson.title,
              summary: lesson.summary,
              order: lessonIndex + 1,
              estimatedMinutes: lesson.estimatedMinutes,
              keyPoints: lesson.keyPoints.join("\n"),
              activities: lesson.suggestedActivities.join("\n"),
              assessments: lesson.assessmentPrompts.join("\n")
            }))
          }
        }
      });
    }
  });

  return NextResponse.json({ ok: true });
}
