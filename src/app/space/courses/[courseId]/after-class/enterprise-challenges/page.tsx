import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { EnterpriseChallengesClient } from "@/components/course-workspace/after-class/EnterpriseChallengesClient";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function EnterpriseChallengesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="enterprise-challenges">
      <EnterpriseChallengesClient courseId={course.id} canManage={canManage} />
    </FanyaCourseShell>
  );
}
