import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiAssistantHub } from "@/components/course-workspace/ai-assistant/AiAssistantHub";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AiAssistantPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-assistant">
      <AiAssistantHub courseId={course.id} courseTitle={course.title} canManage={canManage} />
    </FanyaCourseShell>
  );
}
