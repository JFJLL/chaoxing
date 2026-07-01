import { Bot, ClipboardCheck, MessageSquare, Star, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";

type PageProps = { params: Promise<{ courseId: string }> };

const scenarios = ["调研访谈", "用户访谈", "方案答辩", "课堂问答"];
const dialogue = [
  { role: "AI居民", body: "我平时很少参加社区活动，主要是不知道活动对我有什么帮助。" },
  { role: "学生", body: "您更关注活动时间、内容实用性，还是参与后的反馈机制？" },
  { role: "AI居民", body: "我更在意内容是否和我的生活相关，也希望活动不要太复杂。" }
];
const rubrics = ["提问质量", "信息提取", "表达逻辑", "任务完成度"];

export default async function AiCoachPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel title="AI陪练" description="用模拟访谈、答辩和课堂问答训练学生的任务表达与信息提取能力。">
        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
          <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold text-slate-900">任务场景</h2>
            </div>
            <div className="mt-4 space-y-2">
              {scenarios.map((scenario, index) => (
                <div key={scenario} className={`rounded-xl px-4 py-3 text-sm ${index === 0 ? "bg-blue-600 font-medium text-white" : "bg-white text-slate-700"}`}>
                  {scenario}
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">模拟对话区</h2>
                <p className="mt-1 text-sm text-slate-500">当前示例：社区活动调研访谈。</p>
              </div>
              <Badge tone="blue">前端展示</Badge>
            </div>
            <div className="mt-5 space-y-4">
              {dialogue.map((message) => {
                const isStudent = message.role === "学生";
                return (
                  <div key={`${message.role}-${message.body}`} className={`flex gap-3 ${isStudent ? "justify-end" : "justify-start"}`}>
                    {!isStudent ? <UserRound className="mt-1 h-6 w-6 shrink-0 text-blue-600" /> : null}
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${isStudent ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700"}`}>
                      <p className="text-xs opacity-75">{message.role}</p>
                      <p className="mt-1">{message.body}</p>
                    </div>
                    {isStudent ? <MessageSquare className="mt-1 h-6 w-6 shrink-0 text-blue-600" /> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">评价维度</h2>
            </div>
            <div className="mt-4 space-y-3">
              {rubrics.map((rubric, index) => (
                <div key={rubric} className="rounded-xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-800">{rubric}</span>
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {index === 0 ? "重点" : "观察"}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${76 - index * 8}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
