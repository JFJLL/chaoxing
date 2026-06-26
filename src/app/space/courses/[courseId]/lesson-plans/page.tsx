import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function LessonPlansPage({ params }: PageProps) {
  const { courseId } = await params;
  redirect(`/space/courses/${courseId}/resources#courseware`);
}
