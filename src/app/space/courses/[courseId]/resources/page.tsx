import { Bot, BriefcaseBusiness, Database, FileText, FolderOpen, LibraryBig } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };
type CourseResource = Awaited<ReturnType<typeof loadCourseWorkspace>>["resources"][number];

function hasKeyword(resource: CourseResource, keywords: string[]) {
  const text = `${resource.title} ${resource.type} ${resource.driveFile?.name ?? ""}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function ResourceCard({ resource, icon = "folder" }: { resource: CourseResource; icon?: "file" | "folder" | "case" | "project" }) {
  const Icon = icon === "file" ? FileText : icon === "case" ? LibraryBig : icon === "project" ? BriefcaseBusiness : FolderOpen;
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
      <Icon className="h-6 w-6 text-[#5669c9]" />
      <h2 className="mt-3 font-semibold text-slate-900">{resource.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{resource.driveFile?.name ?? resource.url ?? resource.type}</p>
    </article>
  );
}

function EmptyLibraryState({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">暂无{label}。</p>;
}

export default async function ResourcesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const coursewareResources = course.resources.filter((resource) => hasKeyword(resource, ["courseware", "课件", "ppt", "slide", "幻灯"]));
  const caseResources = course.resources.filter((resource) => hasKeyword(resource, ["case", "案例"]));
  const projectResources = course.resources.filter((resource) => hasKeyword(resource, ["project", "项目"]));
  const groupedResourceIds = new Set([...coursewareResources, ...caseResources, ...projectResources].map((resource) => resource.id));
  const otherResources = course.resources.filter((resource) => !groupedResourceIds.has(resource.id));
  const aiCourseware = course.aiArtifacts.filter((artifact) => artifact.appType === "courseware");

  return (
    <FanyaCourseShell user={user} course={course} activeTab="resources">
      <CourseModulePanel
        title="课程资料库"
        description="课件、案例、项目、知网文献接口和其他课程资料统一管理。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/courseware`}><Bot className="h-4 w-4" />AI课件</LinkButton>}
      >
        <div className="space-y-8">
          <section id="courseware" className="scroll-mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">课件资料</h2>
                <p className="mt-1 text-sm text-slate-500">原“课件”和“教案”入口收敛到资料库，不再单独准备教案页面。</p>
              </div>
              <Badge tone="blue">{coursewareResources.length + aiCourseware.length} 项</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {aiCourseware.map((artifact) => (
                <article key={artifact.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <FileText className="h-6 w-6 text-[#5669c9]" />
                  <h3 className="mt-3 font-semibold text-slate-900">{artifact.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{artifact.prompt ?? "AI 生成课件"}</p>
                </article>
              ))}
              {coursewareResources.map((resource) => <ResourceCard key={resource.id} resource={resource} icon="file" />)}
              {!coursewareResources.length && !aiCourseware.length ? <EmptyLibraryState label="课件资料" /> : null}
            </div>
          </section>

          <section id="cases" className="scroll-mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">案例库</h2>
              <Badge tone="green">{caseResources.length} 项</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {caseResources.map((resource) => <ResourceCard key={resource.id} resource={resource} icon="case" />)}
              {!caseResources.length ? <EmptyLibraryState label="案例资料" /> : null}
            </div>
          </section>

          <section id="projects" className="scroll-mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">项目库</h2>
              <Badge tone="orange">{projectResources.length} 项</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {projectResources.map((resource) => <ResourceCard key={resource.id} resource={resource} icon="project" />)}
              {!projectResources.length ? <EmptyLibraryState label="项目资料" /> : null}
            </div>
          </section>

          <section id="cnki" className="scroll-mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-[#5669c9]" />
                  <h2 className="text-lg font-semibold text-slate-900">知网接口</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">保留课程内的 CNKI 文献检索接入位，可承接机构授权后的论文、期刊、学位论文和参考文献同步。</p>
              </div>
              <Badge tone="blue">接口入口</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {["期刊论文", "学位论文", "参考文献"].map((item) => (
                <div key={item} className="rounded-xl bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">{item}</div>
              ))}
            </div>
          </section>

          <section id="other-materials" className="scroll-mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">其他资料</h2>
              <Badge tone="gray">{otherResources.length} 项</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {otherResources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
              {!otherResources.length ? <EmptyLibraryState label="其他资料" /> : null}
            </div>
          </section>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
