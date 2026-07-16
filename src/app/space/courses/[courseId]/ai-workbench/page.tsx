import { requireUser } from "@/lib/auth";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";
import { AiTutorWorkspace } from "@/components/course-workspace/AiTutorWorkspace";
import { TeacherPrepWorkbench } from "@/components/course-workspace/TeacherPrepWorkbench";
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

  return <TeacherPrepWorkbench courseId={course.id} />;
}
