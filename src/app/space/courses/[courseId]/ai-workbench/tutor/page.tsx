import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiTutorWorkspace } from "@/components/course-workspace/AiTutorWorkspace";
import { listTutorConversations, toTutorConversationDto } from "@/lib/courseWorkspace/aiConversation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AiTutorPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const initialConversations = (await listTutorConversations(user, course.id)).map(toTutorConversationDto);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <AiTutorWorkspace
        courseId={course.id}
        courseTitle={course.title}
        initialConversations={initialConversations}
        showBreadcrumbs
      />
    </FanyaCourseShell>
  );
}
