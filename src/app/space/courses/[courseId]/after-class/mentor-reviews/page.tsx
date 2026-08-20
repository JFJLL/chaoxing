import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { MentorReviewsClient } from "@/components/course-workspace/after-class/MentorReviewsClient";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function MentorReviewsPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="mentor-reviews">
      <MentorReviewsClient courseId={course.id} canManage={canManage} />
    </FanyaCourseShell>
  );
}
