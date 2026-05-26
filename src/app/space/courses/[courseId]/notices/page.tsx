import { Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function NoticesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="notices">
      <CourseModulePanel title="通知" description="查看课程公告和教学提醒。">
        <div className="space-y-3">
          {course.announcements.map((notice) => (
            <article key={notice.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <Megaphone className="h-6 w-6 text-orange-500" />
              <h2 className="mt-3 font-semibold text-slate-900">{notice.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{notice.body}</p>
              <p className="mt-3 text-xs text-slate-400">{notice.author.name} 发布</p>
            </article>
          ))}
          {!course.announcements.length ? <p className="text-sm text-slate-500">暂无通知。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
