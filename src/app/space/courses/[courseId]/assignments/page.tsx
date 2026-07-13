import { Bot, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import type { AiQuestionPayload } from "@/types/courseWorkspace";

type PageProps = { params: Promise<{ courseId: string }> };

function questionCount(payload: string | null) {
  if (!payload) return 0;
  try {
    return (JSON.parse(payload) as AiQuestionPayload).questions.length;
  } catch {
    return 0;
  }
}

export default async function AssignmentsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const assignments = course.aiArtifacts.filter((artifact) => artifact.appType === "question_generation");

  return (
    <FanyaCourseShell user={user} course={course} activeTab="assignments">
      <CourseModulePanel
        title="作业"
        description={canManage ? "管理从备课中心发布给学生的作业任务。" : "查看老师发布的作业和任务。"}
        actions={canManage ? <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}><Bot className="h-4 w-4" />布置作业</LinkButton> : undefined}
      >
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <PenLine className="h-6 w-6 text-violet-600" />
                <Badge tone={assignment.status === "PUBLISHED" ? "green" : "orange"}>{assignment.status === "PUBLISHED" ? "学生端可见" : "未发布"}</Badge>
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">{assignment.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{assignment.prompt ?? "老师发布的课程作业任务。"}</p>
              <p className="mt-3 text-sm text-slate-500">{questionCount(assignment.payload)} 道题</p>
            </article>
          ))}
          {!assignments.length ? <p className="text-sm text-slate-500">{canManage ? "暂无作业，可从备课中心布置作业。" : "暂无老师发布的作业。"}</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
