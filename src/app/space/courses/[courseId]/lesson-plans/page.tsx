import { Bot, NotebookText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function LessonPlansPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const plans = course.aiArtifacts.filter((artifact) => artifact.appType === "lesson_plan");

  return (
    <FanyaCourseShell user={user} course={course} activeTab="lesson-plans">
      <CourseModulePanel
        title="教案"
        description="查看课程章节教案与 AI 生成的教学设计。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/lesson_plan`}><Bot className="h-4 w-4" />AI教案</LinkButton>}
      >
        <div className="space-y-3">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <NotebookText className="h-6 w-6 text-pink-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{plan.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{plan.prompt ?? "AI 生成教案"}</p>
            </article>
          ))}
          {!plans.length ? <p className="text-sm text-slate-500">暂无教案，可使用 AI教案 生成。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
