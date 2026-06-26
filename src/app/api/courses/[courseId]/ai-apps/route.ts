import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import { enabledCourseAiAppTypes, getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { generateCourseAiArtifact } from "@/lib/courseWorkspace/generateAiArtifact";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

const appTypeSchema = z.enum(["question_generation", "lesson_plan", "courseware", "paper_assembly"]);

const createArtifactSchema = z.object({
  appType: appTypeSchema,
  title: z.string().trim().min(1).optional(),
  prompt: z.string().trim().optional()
});

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  const appType = request.nextUrl.searchParams.get("appType");
  const parsedAppType = appType ? appTypeSchema.safeParse(appType) : null;
  if (appType && !parsedAppType?.success) {
    return NextResponse.json({ error: "AI 应用类型无效" }, { status: 400 });
  }

  const artifacts = await db.courseAiArtifact.findMany({
    where: {
      courseId,
      ...(canManage ? {} : { status: "PUBLISHED" }),
      ...(parsedAppType?.success ? { appType: parsedAppType.data } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ artifacts });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;

  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const parsed = createArtifactSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "生成参数无效" }, { status: 400 });
  }

  if (!enabledCourseAiAppTypes.includes(parsed.data.appType)) {
    return NextResponse.json({ error: "该 AI 应用暂未复刻" }, { status: 400 });
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      chapters: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } }
      }
    }
  });

  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }

  const app = getCourseAiAppDefinition(parsed.data.appType);
  const payload = generateCourseAiArtifact({
    appType: parsed.data.appType,
    courseTitle: course.title,
    chapters: course.chapters.map((chapter) => ({
      title: chapter.title,
      lessons: chapter.lessons.map((lesson) => ({ title: lesson.title, summary: lesson.summary }))
    })),
    prompt: parsed.data.prompt
  });

  const artifact = await db.courseAiArtifact.create({
    data: {
      courseId,
      userId: user.id,
      appType: parsed.data.appType,
      title: parsed.data.title ?? `${app.title} ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      prompt: parsed.data.prompt,
      payload: JSON.stringify(payload)
    }
  });

  return NextResponse.json({ artifact }, { status: 201 });
}
