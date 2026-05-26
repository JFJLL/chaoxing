import { Bot, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function ExamsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const papers = course.aiArtifacts.filter((artifact) => artifact.appType === "paper_assembly");

  return (
    <FanyaCourseShell user={user} course={course} activeTab="exams">
      <CourseModulePanel
        title="考试"
        description="查看测验与 AI 组卷生成的试卷。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/paper_assembly`}><Bot className="h-4 w-4" />AI组卷</LinkButton>}
      >
        <div className="space-y-3">
          {papers.map((paper) => (
            <article key={paper.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <ClipboardList className="h-6 w-6 text-blue-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{paper.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{paper.prompt ?? "AI 生成试卷"}</p>
            </article>
          ))}
          {!papers.length ? <p className="text-sm text-slate-500">暂无试卷，可使用 AI组卷 生成。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
