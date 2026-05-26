import { Bot, Hammer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function StructurePage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="structure">
      <CourseModulePanel
        title="课程结构"
        description="按章、课时查看课程目录，并保留原课程建设入口。"
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/space/courses/${course.id}/builder`} variant="secondary"><Hammer className="h-4 w-4" />课程建设</LinkButton>
            <LinkButton href={`/space/courses/${course.id}/ai-import`} variant="secondary"><Bot className="h-4 w-4" />AI 文档建课</LinkButton>
          </div>
        }
      >
        <div className="space-y-4">
          {course.chapters.map((chapter) => (
            <article key={chapter.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <h2 className="font-semibold text-slate-900">{chapter.order}. {chapter.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{chapter.summary ?? "暂无章节简介"}</p>
              <div className="mt-4 space-y-2">
                {chapter.lessons.map((lesson) => (
                  <div key={lesson.id} className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
                    {chapter.order}.{lesson.order} {lesson.title}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!course.chapters.length ? <p className="text-sm text-slate-500">暂无课程目录，可进入课程建设维护。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
