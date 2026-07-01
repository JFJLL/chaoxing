import { BookOpenCheck, Bot, ClipboardCheck, FileText, Radio, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

function averageProgress(enrollments: Array<{ progress: number }>) {
  if (!enrollments.length) return 0;
  return Math.round(enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) / enrollments.length);
}

function prepStatus(progress: number) {
  if (progress >= 80) return { label: "已完成", tone: "green" as const };
  if (progress >= 30) return { label: "进行中", tone: "orange" as const };
  return { label: "未开始", tone: "gray" as const };
}

export default async function PreClassPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const progress = averageProgress(course.enrollments);
  const currentEnrollment = course.enrollments.find((enrollment) => enrollment.userId === user.id);
  const currentProgress = currentEnrollment?.progress ?? progress;
  const nextLessons = course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ ...lesson, chapterTitle: chapter.title }))).slice(0, 4);
  const prepItems = [
    { title: "课前阅读", description: "围绕教材、参考资料和课程资料库安排阅读任务。", icon: FileText },
    { title: "课前练习", description: "使用 AI题库生成预习题，检查学生基础理解。", icon: ClipboardCheck },
    { title: "教材阅读情况", description: "按学生进度回收阅读完成度和薄弱知识点。", icon: BookOpenCheck }
  ];
  const studentSteps = [
    { title: "课前学习", description: "查看老师资料、预习要求，并进入 AI助教学习。", icon: BookOpenCheck },
    { title: "课堂参与", description: "参与签到、投票、抢答、AI陪练和分组任务。", icon: Radio },
    { title: "课后任务", description: "完成作业、考试和老师布置的实践任务。", icon: ClipboardCheck },
    { title: "学习情况", description: `当前学习进度 ${currentProgress}%，待完成内容会在这里汇总。`, icon: UserCheck }
  ];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="pre-class">
      <CourseModulePanel
        title="课前准备"
        description={canManage ? "发布预习要求并查看学生课前阅读、练习和教材阅读情况。" : "查看老师发布的预习要求，并基于课程资料向 AI 助教学习。"}
        actions={
          canManage ? (
            <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}>
              <Bot className="h-4 w-4" />
              AI生成预习题
            </LinkButton>
          ) : (
            <LinkButton href={`/space/courses/${course.id}/pre-class#student-ai`} variant="secondary">
              <Bot className="h-4 w-4" />
              AI助教学习
            </LinkButton>
          )
        }
      >
        {!canManage ? (
          <section id="student-ai" className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-blue-950">学生学习路径</h2>
                <p className="mt-1 text-sm text-blue-800">围绕老师资料完成预习、课堂参与、课后任务和学习复盘。</p>
              </div>
              <Badge tone={prepStatus(currentProgress).tone}>{prepStatus(currentProgress).label}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {studentSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.title} className="rounded-xl bg-white p-4">
                    <Icon className="h-5 w-5 text-blue-600" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {prepItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <Icon className="h-7 w-7 text-[#2165f3]" />
                <h2 className="mt-4 font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">最近需要预习的课时</h2>
                <p className="mt-1 text-sm text-slate-500">来自当前课程目录，后续可接入正式预习任务表。</p>
              </div>
              <Badge tone="blue">{nextLessons.length} 项</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {nextLessons.map((lesson) => (
                <div key={lesson.id} className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{lesson.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{lesson.chapterTitle} · {lesson.summary ?? "暂无课时简介"}</p>
                </div>
              ))}
              {!nextLessons.length ? <p className="text-sm text-slate-500">暂无课程目录，可先使用 AI文档建课生成。</p> : null}
            </div>
          </section>

          <aside className="rounded-2xl bg-blue-50 p-5">
            <UserCheck className="h-6 w-6 text-blue-700" />
            <h2 className="mt-3 font-semibold text-blue-950">学生课前准备情况</h2>
            <p className="mt-2 text-sm leading-6 text-blue-800">选课学生 {course.enrollments.length} 人，平均学习进度 {progress}%。教师端用于查看预习完成情况，学生端用于进入 AI 对话学习。</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
            {canManage ? (
              <div className="mt-4 space-y-2">
                {course.enrollments.slice(0, 5).map((enrollment) => {
                  const status = prepStatus(enrollment.progress);
                  return (
                    <div key={enrollment.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                      <span className="truncate text-sm text-slate-700">{enrollment.user.name}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
