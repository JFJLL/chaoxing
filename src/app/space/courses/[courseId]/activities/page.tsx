import { Bot, CheckCircle2, WalletCards } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

const activities = [
  { title: "AI陪练", description: "基于当前课程任务模拟访谈、问答或课堂练习场景。", icon: Bot, hrefSegment: "ai-coach" },
  { title: "签到", description: "教师展示动态二维码，学生扫码或输入短码完成签到。", icon: CheckCircle2, hrefSegment: "attendance" }
];

export default async function ActivitiesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel
        title="上课"
        description={canManage ? "组织 AI 陪练和动态二维码签到。" : "参加老师发布的 AI 陪练和课堂签到。"}
        actions={
          canManage ? (
            <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}>
              <Bot className="h-4 w-4" />
              AI生成课堂练习
            </LinkButton>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activities.map((activity) => {
            const Icon = activity.icon;
            const content = (
              <>
                <Icon className="h-8 w-8 text-blue-600" />
                <h2 className="mt-4 font-semibold text-slate-900">{activity.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{activity.description}</p>
              </>
            );
            return (
              <a key={activity.title} href={`/space/courses/${course.id}/${activity.hrefSegment}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:border-blue-100 hover:bg-blue-50/50">
                {content}
              </a>
            );
          })}
        </div>
        <div className="mt-5">
          <aside className="max-w-sm rounded-2xl bg-blue-50 p-5 text-sm text-blue-800">
            <WalletCards className="h-6 w-6" />
            <p className="mt-3 font-semibold">课堂积分</p>
            <p className="mt-2 leading-6">当前班级学习者：{course.enrollments.length} 人。</p>
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
