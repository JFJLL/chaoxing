import { BookOpenCheck, Bot, ClipboardCheck, FileText, UserCheck } from "lucide-react";
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

export default async function PreClassPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const progress = averageProgress(course.enrollments);
  const nextLessons = course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ ...lesson, chapterTitle: chapter.title }))).slice(0, 4);
  const prepItems = [
    { title: "课前阅读", description: "围绕教材、参考资料和课程资料库安排阅读任务。", icon: FileText },
    { title: "课前练习", description: "使用 AI题库生成预习题，检查学生基础理解。", icon: ClipboardCheck },
    { title: "教材阅读情况", description: "按学生进度回收阅读完成度和薄弱知识点。", icon: BookOpenCheck }
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
            <LinkButton href={`/space/courses/${course.id}/ai-workbench`} variant="secondary">
              <Bot className="h-4 w-4" />
              AI助教学习
            </LinkButton>
          )
        }
      >
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
          </aside>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
