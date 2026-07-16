import { Bot, CheckCircle2, MessagesSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import Link from "next/link";

type PageProps = { params: Promise<{ courseId: string }> };

const activities = [
  { title: "AI陪练", description: "基于当前课程任务模拟访谈、问答或课堂练习场景。", icon: Bot, hrefSegment: "ai-coach" },
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
        description={canManage ? "使用 AI 助教处理课堂问答，并组织 AI 陪练和动态二维码签到。" : "参加老师发布的 AI 陪练和课堂签到。"}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleActivities.map((activity) => {
            const Icon = activity.icon;
            return (
              <Link
                key={activity.title}
                href={`/space/courses/${course.id}/${activity.hrefSegment}`}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:border-blue-100 hover:bg-blue-50/50"
              >
                <Icon className="h-8 w-8 text-blue-600" />
                <h2 className="mt-4 font-semibold text-slate-900">{activity.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{activity.description}</p>
              </Link>
            );
          })}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
