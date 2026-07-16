import { AiCourseSearch } from "@/components/course-workspace/AiCourseSearch";
import { AiTutor, type TutorConversationDto } from "@/components/course-workspace/AiTutor";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

export function AiTutorWorkspace({
  courseId,
  courseTitle,
  initialConversations,
  showBreadcrumbs = false
}: {
  courseId: string;
  courseTitle: string;
  initialConversations: TutorConversationDto[];
  showBreadcrumbs?: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-white p-5 shadow-sm lg:p-6">
        {showBreadcrumbs ? <CourseWorkspaceBreadcrumbs courseId={courseId} courseTitle={courseTitle} current="AI助教" /> : null}
        <div className={`flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${showBreadcrumbs ? "mt-5" : ""}`}>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">AI助教</h1>
            <p className="mt-1 text-sm text-slate-500">直接提问课程内容，或先搜索课程资料定位来源。</p>
          </div>
          <AiCourseSearch courseId={courseId} />
        </div>
      </section>
      <AiTutor courseId={courseId} courseTitle={courseTitle} initialConversations={initialConversations} />
    </div>
  );
}
