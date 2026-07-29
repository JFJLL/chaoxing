import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import type { CourseDirectoryNode } from "@/types/course";
import { CourseOutlineSyncError, syncCourseOutline } from "@/lib/imports/applyOutline";

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
  chapters: z.array(chapterSchema),
  expectedOutlineVersion: z.number().int().min(0)
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

  const [course, chapters] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { outlineVersion: true } }),
    db.chapter.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      include: {
        lessons: {
          orderBy: { order: "asc" }
        }
      }
    })
  ]);

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

  return NextResponse.json({ chapters: directory, outlineVersion: course?.outlineVersion ?? 0 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseManager(user, courseId);
  const body = outlineSchema.parse(await request.json());

  try {
    const result = await db.$transaction((tx) => syncCourseOutline({
      courseId,
      outline: { chapters: body.chapters },
      actorId: user.id,
      expectedOutlineVersion: body.expectedOutlineVersion,
      tx
    }));
    return NextResponse.json({ ok: true, outlineVersion: result.outlineVersion, chapters: result.chapters });
  } catch (error) {
    if (error instanceof CourseOutlineSyncError) {
      return NextResponse.json({
        error: error.message,
        code: error.code
      }, { status: error.code === "COURSE_OUTLINE_ITEM_INVALID" ? 400 : 409 });
    }
    throw error;
  }
}
