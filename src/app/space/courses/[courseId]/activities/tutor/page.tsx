import { requireUser, type SessionUser } from "@/lib/auth";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiTutorHeader } from "@/components/course-workspace/AiTutorWorkspace";
import { AiTutor } from "@/components/course-workspace/AiTutor";
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
      <div className="space-y-5">
        <AiTutorHeader courseId={course.id} />
        {conversationContent}
      </div>
    </FanyaCourseShell>
  );
}
