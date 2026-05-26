import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function ResourcesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="resources">
      <CourseModulePanel title="资料" description="课程资料、云盘附件和课时资源集中展示。">
        <div className="grid gap-3 md:grid-cols-2">
          {course.resources.map((resource) => (
            <article key={resource.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <FolderOpen className="h-6 w-6 text-emerald-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{resource.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{resource.driveFile?.name ?? resource.url ?? resource.type}</p>
            </article>
          ))}
          {!course.resources.length ? <p className="text-sm text-slate-500">暂无资料。</p> : null}
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
