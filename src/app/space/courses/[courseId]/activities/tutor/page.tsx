import { requireUser, type SessionUser } from "@/lib/auth";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiTutor } from "@/components/course-workspace/AiTutor";
import { AiAssistantHub } from "@/components/course-workspace/ai-assistant/AiAssistantHub";
import { listTutorConversations, toTutorConversationDto } from "@/lib/courseWorkspace/aiConversation";

type PageProps = { params: Promise<{ courseId: string }> };

async function TutorConversationContent({
  user,
  courseId,
  courseTitle,
  canManage
}: {
  user: SessionUser;
  courseId: string;
  courseTitle: string;
  canManage: boolean;
}) {
  const initialConversations = (await listTutorConversations(user, courseId)).map(toTutorConversationDto);
  return <AiTutor courseId={courseId} courseTitle={courseTitle} canManage={canManage} initialConversations={initialConversations} />;
}

export default async function ClassroomAiTutorPage({ params }: PageProps) {
  const [user, { courseId }] = await Promise.all([requireUser(), params]);
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const conversationContent = await TutorConversationContent({
    user,
    courseId: course.id,
    courseTitle: course.title,
    canManage
  });

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <AiAssistantHub courseId={course.id} courseTitle={course.title} canManage={canManage}>
        {conversationContent}
      </AiAssistantHub>
    </FanyaCourseShell>
  );
}
