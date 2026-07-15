import { Bot, ClipboardList, PenLine, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { db } from "@/lib/db";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AfterClassPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const [assignmentCount, examCount, questionCount] = await Promise.all([
    db.assignment.count({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) } }),
    db.exam.count({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) } }),
    canManage ? db.courseQuestion.count({ where: { courseId, status: "APPROVED" } }) : Promise.resolve(0)
  ]);
  const modules = [
    { title: "作业", description: "学生查看并提交老师发布的作业。", href: `/space/courses/${course.id}/assignments`, icon: PenLine, count: assignmentCount },
    { title: "考试", description: "学生在规定时间内参加正式考试。", href: `/space/courses/${course.id}/exams`, icon: ClipboardList, count: examCount },
    { title: "题库", description: "教师维护已确认题目，供作业和考试复用。", href: `/space/courses/${course.id}/question-bank`, icon: ScrollText, count: questionCount }
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
