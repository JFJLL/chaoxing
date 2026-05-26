import { Bot, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function CoursewarePage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const resources = course.resources.filter((resource) => resource.type.includes("courseware") || resource.type.includes("drive") || resource.type.includes("file"));

  return (
    <FanyaCourseShell user={user} course={course} activeTab="courseware">
      <CourseModulePanel
        title="课件"
        description="管理课程课件与 AI 生成的教学幻灯片。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/courseware`}><Bot className="h-4 w-4" />AI课件</LinkButton>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {resources.map((resource) => (
            <article key={resource.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <FileText className="h-6 w-6 text-blue-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{resource.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{resource.driveFile?.name ?? resource.type}</p>
            </article>
          ))}
          {!resources.length ? <p className="text-sm text-slate-500">暂无课件资料，可使用 AI课件 生成。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
