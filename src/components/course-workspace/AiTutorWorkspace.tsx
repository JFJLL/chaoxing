import { AiCourseSearch } from "@/components/course-workspace/AiCourseSearch";
import { AiTutor, type TutorConversationDto } from "@/components/course-workspace/AiTutor";

export function AiTutorWorkspace({
  courseId,
  courseTitle,
  canManage = false,
  initialConversations
}: {
  courseId: string;
  courseTitle: string;
  canManage?: boolean;
  initialConversations: TutorConversationDto[];
}) {
  return (
    <div className="space-y-5">
      <AiTutorHeader courseId={courseId} />
      <AiTutor courseId={courseId} courseTitle={courseTitle} canManage={canManage} initialConversations={initialConversations} />
    </div>
  );
}

export function AiTutorHeader({
  courseId
}: {
  courseId: string;
}) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-panel lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cx-blue)]">课程智能问答</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">AI助教</h1>
          <p className="mt-1 text-sm text-slate-500">直接提问课程内容，或先搜索课程资料定位来源。</p>
        </div>
        <AiCourseSearch courseId={courseId} />
      </div>
    </section>
  );
}
