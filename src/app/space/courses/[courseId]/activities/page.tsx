import { ArrowRight, CheckCircle2, MessagesSquare, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel, courseModuleLinkCardClassName } from "@/components/course-workspace/CourseModulePanel";
import Link from "next/link";

type PageProps = { params: Promise<{ courseId: string }> };

const activities = [
  { title: "Copilot", description: "选择教师开放的 Skill，并结合课程云盘文件完成提问。", icon: Sparkles, hrefSegment: "activities/copilot" },
  { title: "签到", description: "教师展示动态二维码，学生扫码或输入短码完成签到。", icon: CheckCircle2, hrefSegment: "attendance" }
];

const teacherTutorActivity = {
  title: "AI助教",
  description: "基于当前课程内容回答课堂问题，并定位到可核对的资料来源。",
  icon: MessagesSquare,
  hrefSegment: "activities/tutor"
};

export default async function ActivitiesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const visibleActivities = canManage ? [teacherTutorActivity, ...activities] : activities;

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel
        title="上课"
        description={canManage ? "使用 Copilot、AI 助教和动态二维码组织课堂。" : "使用课程 Copilot，并参加课堂签到。"}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleActivities.map((activity) => {
            const Icon = activity.icon;
            return (
              <Link
                key={activity.title}
                href={`/space/courses/${course.id}/${activity.hrefSegment}`}
                className={courseModuleLinkCardClassName}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[var(--cx-blue)] shadow-sm transition group-hover:shadow-md">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--cx-blue)]" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-semibold text-slate-900">{activity.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{activity.description}</p>
              </Link>
            );
          })}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
