import { MessageCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function DiscussionsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const topics = course.chapters.length
    ? course.chapters.map((chapter) => ({ title: `${chapter.title} 讨论`, body: chapter.summary ?? "围绕本章重点发起课程讨论。" }))
    : [{ title: "课程导入讨论", body: "围绕课程目标、学习方法和资源使用发起讨论。" }];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="discussions">
      <CourseModulePanel title="讨论" description="沉淀课程讨论主题和课堂互动记录。">
        <div className="space-y-3">
          {topics.map((topic) => (
            <article key={topic.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <MessageCircle className="h-6 w-6 text-[#A8402F]" />
              <h2 className="mt-3 font-semibold text-slate-900">{topic.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topic.body}</p>
            </article>
          ))}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
