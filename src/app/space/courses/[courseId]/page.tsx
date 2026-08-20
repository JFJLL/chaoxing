import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseDefaultPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  redirect(`/space/courses/${courseId}/${canManage ? "ai-workbench" : "ai-assistant"}`);
}
