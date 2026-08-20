import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { InnovationMarketClient } from "@/components/course-workspace/after-class/InnovationMarketClient";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function InnovationMarketPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="innovation-market">
      <InnovationMarketClient courseId={course.id} canManage={canManage} />
    </FanyaCourseShell>
  );
}
