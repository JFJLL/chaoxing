import { Bot, ClipboardList, PenLine, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AfterClassPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const questions = course.aiArtifacts.filter((artifact) => artifact.appType === "question_generation");
  const papers = course.aiArtifacts.filter((artifact) => artifact.appType === "paper_assembly");
  const modules = [
    { title: "作业", description: "学生查看老师发布的作业和任务。", href: `/space/courses/${course.id}/assignments`, icon: PenLine, count: questions.length },
    { title: "考试", description: "学生查看测验与阶段考试。", href: `/space/courses/${course.id}/exams`, icon: ClipboardList, count: papers.length },
    { title: "题库", description: canManage ? "教师维护 AI题库和练习题。" : "题库为教师管理入口，学生侧只开放作业和考试。", href: `/space/courses/${course.id}/question-bank`, icon: ScrollText, count: questions.length }
  ];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="after-class">
      <CourseModulePanel
        title="课后"
        description={canManage ? "管理作业、考试、检测和 AI题库。" : "完成老师发布的作业和考试。"}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`} variant="secondary">
                <Bot className="h-4 w-4" />
                AI题库
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/paper_assembly`}>
                <Bot className="h-4 w-4" />
                AI组卷
              </LinkButton>
            </div>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {modules.filter((module) => canManage || module.title !== "题库").map((module) => {
            const Icon = module.icon;
            return (
              <a key={module.title} href={module.href} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:border-blue-100 hover:bg-blue-50/50">
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-7 w-7 text-[#2165f3]" />
                  <Badge tone={module.count ? "blue" : "gray"}>{module.count} 项</Badge>
                </div>
                <h2 className="mt-4 font-semibold text-slate-900">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
              </a>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">AI检测与练习生成</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            AI题库基于课程知识库生成练习题；教师端用于出题、组卷和检测，学生端只进入作业与考试，避免把题库维护能力暴露给学生。
          </p>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
