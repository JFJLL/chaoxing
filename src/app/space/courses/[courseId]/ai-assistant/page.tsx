import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AiAssistantPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  await loadCourseWorkspace(user, courseId);
  redirect(`/space/courses/${courseId}/activities/tutor`);
}
