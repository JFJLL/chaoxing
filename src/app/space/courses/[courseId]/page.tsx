import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseDefaultPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  redirect(`/space/courses/${courseId}/${canManage ? "ai-workbench" : "pre-class"}`);
}
