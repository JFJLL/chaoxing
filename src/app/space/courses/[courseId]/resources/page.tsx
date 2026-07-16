import { BriefcaseBusiness, FileText, GraduationCap, LibraryBig } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";
import { CourseResourceUpload } from "@/components/course-workspace/CourseResourceUpload";
import { isTeacher } from "@/lib/permissions";

type PageProps = { params: Promise<{ courseId: string }> };

type CourseResource = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  driveFile: { id: string; name: string } | null;
};

const supplementalLibraries = [
  {
    title: "案例库",
    description: "沉淀可用于课堂讲解、讨论和出题的真实案例。",
    icon: LibraryBig
  },
  {
    title: "项目库",
    description: "保存课程项目、实训任务和阶段性交付要求。",
    icon: BriefcaseBusiness
  },
  {
    title: "慕课 / 参考视频",
    description: "收录慕课章节、示范视频和课外参考内容。",
    icon: GraduationCap
  }
] as const;

function ResourceCard({ resource }: { resource: CourseResource }) {
  const content = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="line-clamp-1 font-semibold text-slate-900">{resource.title}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{resource.driveFile?.name ?? resource.url ?? resource.type}</p>
      </div>
    </>
  );
  const className = "flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40";
  if (resource.driveFile) return <a href={`/api/drive/${resource.driveFile.id}?download=1`} className={className}>{content}</a>;
  if (resource.url) return <a href={resource.url} target="_blank" rel="noreferrer" className={className}>{content}</a>;
  return <article className={className}>{content}</article>;
}

export default async function ResourcesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const resources = await db.resource.findMany({
    where: { courseId: course.id },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      url: true,
      driveFile: { select: { id: true, name: true } }
    }
  });

  return (
    <FanyaCourseShell user={user} course={course} activeTab="resources">
      <CourseModulePanel
        title="课程内容与知识"
        description="维护 AI 生成所依据的课程内容，并检查内容是否完整。"
        actions={<PrepWorkflowNavigation courseId={course.id} workflow="content" active="resources" />}
      >
        <section>
          <h2 className="text-lg font-semibold text-slate-900">课程资料库</h2>
          <p className="mt-1 text-sm text-slate-500">集中维护当前课程可直接引用、并可作为 AI 生成依据的资料。</p>
          {canManage ? <div className="mt-4"><CourseResourceUpload courseId={course.id} folderConfigured={Boolean(course.copilotFolderId)} /></div> : null}
          {resources.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              <p className="font-medium text-slate-800">还没有课程资料</p>
              <p className="mt-1 text-sm text-slate-500">从“导入课程文档”开始，确认后的内容会成为教案、题目和课件的生成依据。</p>
            </div>
          )}
        </section>
        <section className="mt-8 border-t border-slate-100 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">扩展资料库</h2>
          <p className="mt-1 text-sm text-slate-500">先保留分类入口，后续添加内容时直接进入对应资料库。</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {supplementalLibraries.map((library) => {
              const Icon = library.icon;
              return (
                <article key={library.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-400">0 项</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{library.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{library.description}</p>
                  <p className="mt-4 text-xs text-slate-400">暂未添加内容</p>
                </article>
              );
            })}
          </div>
        </section>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
