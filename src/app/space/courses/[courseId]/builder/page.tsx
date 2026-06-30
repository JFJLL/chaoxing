import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { ChapterTree } from "@/components/courses/ChapterTree";
import type { CourseDirectoryNode } from "@/types/course";
import { LinkButton } from "@/components/ui/Button";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

function splitList(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function CourseBuilderPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  await requireCourseOwner(user, courseId);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      chapters: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } }
      }
    }
  });

  if (!course) notFound();

  const chapters: CourseDirectoryNode[] = course.chapters.map((chapter) => ({
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

  return (
    <FanyaCourseShell user={user} course={course} activeTab="structure">
      <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
        <div className="space-y-5">
          <header className="flex flex-col gap-3 border-b border-[var(--cx-border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-slate-500">课程建设</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{course.title}</h1>
            </div>
            <LinkButton href={`/space/courses/${courseId}/ai-import`} variant="secondary">
              AI 文档建课
            </LinkButton>
          </header>
          <ChapterTree courseId={courseId} initialChapters={chapters} />
        </div>
      </section>
    </FanyaCourseShell>
  );
}
