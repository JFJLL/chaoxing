import { BarChart3, Bot, GraduationCap, ListChecks, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";

type PageProps = { params: Promise<{ courseId: string }> };

function averageProgress(enrollments: Array<{ progress: number }>) {
  if (!enrollments.length) return 0;
  return Math.round(enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) / enrollments.length);
}

export default async function AnalyticsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const progress = averageProgress(course.enrollments);
  const aiArtifacts = course.aiArtifacts.length;
  const metrics = [
    { label: "选课学生", value: course.enrollments.length, icon: UsersRound },
    { label: "平均进度", value: `${progress}%`, icon: BarChart3 },
    { label: "课程课时", value: course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0), icon: ListChecks },
    { label: "AI产物", value: aiArtifacts, icon: Bot }
  ];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="analytics">
      <CourseModulePanel
        title="学情分析"
        description={canManage ? "查看选课学生名单、学生上课情况和 AI 学情分析。" : "查看自己的学习进度和课程反馈。"}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <Icon className="h-6 w-6 text-[#2165f3]" />
                <p className="mt-4 text-sm text-slate-500">{metric.label}</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{metric.value}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">选课学生名单</h2>
                <p className="mt-1 text-sm text-slate-500">用于教师查看学生上课与预习情况。</p>
              </div>
              <Badge tone="blue">{course.enrollments.length} 人</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {course.enrollments.slice(0, 8).map((enrollment) => (
                <div key={enrollment.id} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                      {enrollment.user.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{enrollment.user.name}</p>
                      <p className="truncate text-xs text-slate-500">{enrollment.user.email}</p>
                    </div>
                  </div>
                  <span className="text-right text-sm font-medium text-slate-700">{enrollment.progress}%</span>
                </div>
              ))}
              {!course.enrollments.length ? <p className="text-sm text-slate-500">暂无选课学生。</p> : null}
            </div>
          </section>

          <aside className="rounded-2xl bg-blue-50 p-5">
            <GraduationCap className="h-6 w-6 text-blue-700" />
            <h2 className="mt-3 font-semibold text-blue-950">AI学情分析</h2>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              输入为学生情况、课程结构和 AI 产物；当前先输出学习情况概览。后续接入真实课堂行为后，可细化到预习、课堂互动、作业、考试四类风险。
            </p>
            <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-blue-800">
              {progress >= 70 ? "整体学习进度稳定，可继续增加实践任务。" : "整体进度偏低，建议先发布课前预习任务并用 AI题库补充基础练习。"}
            </div>
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
