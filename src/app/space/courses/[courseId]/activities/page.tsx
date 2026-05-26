import { CheckCircle2, MessageSquare, Radio, Vote } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";

type PageProps = { params: Promise<{ courseId: string }> };

const activities = [
  { title: "签到", description: "课堂到课确认与学习状态收集", icon: CheckCircle2 },
  { title: "投票", description: "快速收集学生观点并形成课堂反馈", icon: Vote },
  { title: "抢答", description: "围绕知识点组织即时互动", icon: Radio },
  { title: "讨论", description: "发布主题，沉淀课堂讨论材料", icon: MessageSquare }
];

export default async function ActivitiesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel title="班级活动" description="围绕课程章节组织签到、投票、抢答和讨论。">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <article key={activity.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <Icon className="h-8 w-8 text-blue-600" />
                <h2 className="mt-4 font-semibold text-slate-900">{activity.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{activity.description}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-5 rounded-2xl bg-blue-50 p-5 text-sm text-blue-800">当前班级学习者：{course.enrollments.length} 人</div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
