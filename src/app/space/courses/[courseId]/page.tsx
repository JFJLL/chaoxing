import { notFound } from "next/navigation";
import { Bot, Hammer, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, isTeacher } from "@/lib/permissions";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseOverviewPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  await requireCourseAccess(user, courseId);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      owner: true,
      chapters: { include: { lessons: true } },
      announcements: { orderBy: { createdAt: "desc" }, take: 3 }
    }
  });

  if (!course) notFound();

  const chapterCount = course.chapters.length;
  const lessonCount = course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
  const canManage = isTeacher(user) && course.ownerId === user.id;

  return (
    <div className="space-y-6">
      <header className="rounded-md bg-gradient-to-br from-indigo-500 to-blue-500 p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge tone={course.status === "ACTIVE" ? "green" : "orange"}>{course.status === "ACTIVE" ? "已发布" : "草稿"}</Badge>
            <h1 className="mt-4 text-3xl font-semibold">{course.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">{course.description ?? "暂无课程简介"}</p>
            <p className="mt-3 text-sm text-white/80">教师：{course.owner.name}</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/builder`} variant="secondary">
                <Hammer className="h-4 w-4" />
                课程建设
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/ai-import`} variant="secondary">
                <Bot className="h-4 w-4" />
                AI 文档建课
              </LinkButton>
              <CoursePublishButton courseId={course.id} status={course.status} />
            </div>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <p className="text-sm text-slate-500">章节数</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{chapterCount}</p>
        </div>
        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <p className="text-sm text-slate-500">课时数</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{lessonCount}</p>
        </div>
        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <p className="text-sm text-slate-500">学期</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{course.term ?? "未设置"}</p>
        </div>
      </section>

      <section className="rounded-md border border-[var(--cx-border)] p-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[var(--cx-blue)]" />
          <h2 className="font-semibold text-slate-900">课程公告</h2>
        </div>
        <div className="mt-4 space-y-3">
          {course.announcements.map((announcement) => (
            <article key={announcement.id} className="rounded-md bg-slate-50 p-3">
              <p className="font-medium text-slate-800">{announcement.title}</p>
              <p className="mt-1 text-sm text-slate-500">{announcement.body}</p>
            </article>
          ))}
          {!course.announcements.length ? <p className="text-sm text-slate-500">暂无公告</p> : null}
        </div>
      </section>
    </div>
  );
}
