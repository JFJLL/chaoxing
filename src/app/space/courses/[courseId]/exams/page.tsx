import { Bot, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function ExamsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const papers = course.aiArtifacts.filter((artifact) => artifact.appType === "paper_assembly");

  return (
    <FanyaCourseShell user={user} course={course} activeTab="exams">
      <CourseModulePanel
        title="考试"
        description={canManage ? "管理从备课中心发布给学生的测验试卷。" : "查看老师发布的测验与阶段考试。"}
        actions={canManage ? <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/paper_assembly`}><Bot className="h-4 w-4" />AI组卷</LinkButton> : undefined}
      >
        <div className="space-y-3">
          {papers.map((paper) => (
            <article key={paper.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <ClipboardList className="h-6 w-6 text-blue-600" />
                <Badge tone={paper.status === "PUBLISHED" ? "green" : "orange"}>{paper.status === "PUBLISHED" ? "学生端可见" : "未发布"}</Badge>
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">{paper.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{paper.prompt ?? "AI 生成试卷"}</p>
            </article>
          ))}
          {!papers.length ? <p className="text-sm text-slate-500">{canManage ? "暂无试卷，可使用 AI组卷 生成。" : "暂无老师发布的考试。"}</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
