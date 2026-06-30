import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "@/types/courseWorkspace";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiAppGenerator } from "@/components/course-workspace/AiAppGenerator";

type PageProps = {
  params: Promise<{ courseId: string; appType: string }>;
};

function parseAppType(value: string): CourseAiAppType | null {
  if (value === "question_generation" || value === "lesson_plan" || value === "courseware" || value === "paper_assembly") {
    return value;
  }
  return null;
}

export default async function AiAppDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId, appType: rawAppType } = await params;
  const appType = parseAppType(rawAppType);
  if (!appType) notFound();

  const appDefinition = getCourseAiAppDefinition(appType);
  if (!appDefinition.enabled || !appDefinition.appType) notFound();
  const app = { ...appDefinition, appType: appDefinition.appType };

  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  if (!canManage) redirect(`/space/courses/${course.id}/resources`);

  const artifacts = course.aiArtifacts.filter((artifact) => artifact.appType === appType);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-[28px] bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href={`/space/courses/${course.id}/ai-workbench`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-700">
              <ArrowLeft className="h-4 w-4" />
              AI工作台
            </Link>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">{app.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{app.description}</p>
          </div>
        </div>

        <AiAppGenerator courseId={course.id} app={app} initialArtifacts={artifacts} />
      </div>
    </FanyaCourseShell>
  );
}
