import { PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AssignmentsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const assignments = course.chapters.flatMap((chapter) =>
    chapter.lessons.slice(0, 1).map((lesson) => ({
      title: `${lesson.title} 课后任务`,
      body: lesson.assessments ?? lesson.summary ?? "完成本课时学习任务并提交反思。"
    }))
  );

  return (
    <FanyaCourseShell user={user} course={course} activeTab="assignments">
      <CourseModulePanel title="作业" description="查看课程任务点和课后提交要求。">
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <article key={assignment.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <PenLine className="h-6 w-6 text-violet-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{assignment.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{assignment.body}</p>
              <span className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">待发布</span>
            </article>
          ))}
          {!assignments.length ? <p className="text-sm text-slate-500">暂无作业。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
