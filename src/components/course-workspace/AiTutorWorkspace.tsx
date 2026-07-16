import { AiCourseSearch } from "@/components/course-workspace/AiCourseSearch";
import { AiTutor, type TutorConversationDto } from "@/components/course-workspace/AiTutor";

export function AiTutorWorkspace({
  courseId,
  courseTitle,
  initialConversations
}: {
  courseId: string;
  courseTitle: string;
  initialConversations: TutorConversationDto[];
}) {
  return (
    <div className="space-y-5">
      <AiTutorHeader courseId={courseId} />
      <AiTutor courseId={courseId} courseTitle={courseTitle} initialConversations={initialConversations} />
    </div>
  );
}

export function AiTutorHeader({
  courseId
}: {
  courseId: string;
}) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI助教</h1>
          <p className="mt-1 text-sm text-slate-500">直接提问课程内容，或先搜索课程资料定位来源。</p>
        </div>
        <AiCourseSearch courseId={courseId} />
      </div>
    </section>
  );
}
