import { Bot, CheckCircle2, ClipboardCheck, MessageSquare, Radio, UsersRound, Vote, WalletCards } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

const activities = [
  { title: "AI陪练", description: "基于当前课程任务模拟访谈、问答或课堂练习场景。", icon: Bot },
  { title: "签到", description: "课堂到课确认与学习状态收集", icon: CheckCircle2 },
  { title: "投票", description: "快速收集学生观点并形成课堂反馈", icon: Vote },
  { title: "抢答", description: "围绕知识点组织即时互动", icon: Radio },
  { title: "分组研讨", description: "发布主题，沉淀小组讨论材料和课堂结论", icon: UsersRound },
  { title: "实践任务", description: "按课程类型发布调研、图片设计、交互设计或视频制作任务。", icon: ClipboardCheck }
];

export default async function ActivitiesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const taskSuggestions = [
    "调研访谈：让 AI 模拟居民或用户，学生完成访谈记录。",
    "图片设计：围绕课程主题产出海报、封面或视觉方案。",
    "交互设计：拆解一个课堂场景并提交流程原型。",
    "视频制作：用课程知识点完成短视频脚本和成片任务。"
  ];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel
        title="上课"
        description="围绕课堂管理组织 AI陪练、签到、投票、抢答、分组研讨和实践任务。"
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
            return (
              <article key={activity.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <Icon className="h-8 w-8 text-blue-600" />
                <h2 className="mt-4 font-semibold text-slate-900">{activity.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{activity.description}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold text-slate-900">AI任务建议</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {taskSuggestions.map((item) => (
                <div key={item} className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <aside className="rounded-2xl bg-blue-50 p-5 text-sm text-blue-800">
            <WalletCards className="h-6 w-6" />
            <p className="mt-3 font-semibold">课堂积分</p>
            <p className="mt-2 leading-6">当前班级学习者：{course.enrollments.length} 人。</p>
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
