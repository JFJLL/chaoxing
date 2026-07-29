import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AiImportPage({ params }: PageProps) {
  const { courseId } = await params;
  redirect(`/space/courses/${courseId}/ai-workbench/content`);
}
