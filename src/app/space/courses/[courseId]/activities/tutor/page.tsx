import { Suspense } from "react";
import { requireUser, type SessionUser } from "@/lib/auth";
import { requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiTutorHeader } from "@/components/course-workspace/AiTutorWorkspace";
import { AiTutor } from "@/components/course-workspace/AiTutor";
import { listTutorConversations, toTutorConversationDto } from "@/lib/courseWorkspace/aiConversation";

type PageProps = { params: Promise<{ courseId: string }> };

async function TutorConversationContent({
  user,
  courseId,
  courseTitle
}: {
  user: SessionUser;
  courseId: string;
  courseTitle: string;
}) {
  const initialConversations = (await listTutorConversations(user, courseId)).map(toTutorConversationDto);
  return <AiTutor courseId={courseId} courseTitle={courseTitle} initialConversations={initialConversations} />;
}

export default async function ClassroomAiTutorPage({ params }: PageProps) {
  const [user, { courseId }] = await Promise.all([requireUser(), params]);
  const course = await requireCourseAccess(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <div className="space-y-5">
        <AiTutorHeader courseId={course.id} />
        <Suspense fallback={<div role="status" className="h-[420px] animate-pulse rounded-[28px] bg-white shadow-sm"><span className="sr-only">正在载入 AI 助教对话</span></div>}>
          <TutorConversationContent user={user} courseId={course.id} courseTitle={course.title} />
        </Suspense>
      </div>
    </FanyaCourseShell>
  );
}
