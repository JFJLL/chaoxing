import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function LegacyAiTutorPage({ params }: PageProps) {
  const { courseId } = await params;
  redirect(`/space/courses/${courseId}/activities/tutor`);
}
