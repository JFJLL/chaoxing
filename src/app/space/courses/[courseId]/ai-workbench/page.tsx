import { requireUser } from "@/lib/auth";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";
import { AiTutorWorkspace } from "@/components/course-workspace/AiTutorWorkspace";
import { TeacherPrepWorkbench } from "@/components/course-workspace/TeacherPrepWorkbench";
import { Badge } from "@/components/ui/Badge";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { listTutorConversations, toTutorConversationDto } from "@/lib/courseWorkspace/aiConversation";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function AiWorkbenchPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  if (!canManage) {
    const initialTutorConversations = (await listTutorConversations(user, course.id)).map(toTutorConversationDto);
    return (
      <AiTutorWorkspace courseId={course.id} courseTitle={course.title} initialConversations={initialTutorConversations} />
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-[28px] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Badge tone={course.status === "ACTIVE" ? "green" : "orange"}>{course.status === "ACTIVE" ? "已发布" : "草稿"}</Badge>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">备课中心</h1>
          <p className="mt-1 text-sm text-slate-500">{course.title}</p>
        </div>
        <CoursePublishButton courseId={course.id} status={course.status} />
      </section>
      <TeacherPrepWorkbench courseId={course.id} />
    </div>
  );
}
