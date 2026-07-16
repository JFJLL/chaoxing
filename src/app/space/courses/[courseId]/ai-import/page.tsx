import { notFound } from "next/navigation";
import { BrainCircuit, CircleHelp, ListTree, Network, Route } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { recoverImportJobsFromDatabase } from "@/lib/imports/importQueue";
import { UploadPanel } from "@/components/ai-import/UploadPanel";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import Link from "next/link";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

const outputCards = [
  { title: "课程大纲", description: "提炼课程目标、教学范围和核心主题。", icon: ListTree },
  { title: "课程目录", description: "生成章节、课时和学习顺序。", icon: Route },
  { title: "知识图谱", description: "梳理知识点和知识关系。", icon: Network },
  { title: "能力图谱", description: "对应能力目标、实践任务和评价要求。", icon: BrainCircuit },
  { title: "问题图谱", description: "沉淀课堂提问、检测问题和讨论线索。", icon: CircleHelp }
];

export default async function AiImportPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  await requireCourseOwner(user, courseId);
  await recoverImportJobsFromDatabase(courseId);
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      imports: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  if (!course) notFound();

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
        <div className="space-y-6">
          <header className="border-b border-[var(--cx-border)] pb-5">
            <CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current="AI文档建课" />
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">AI文档建课</h1>
          </header>
          <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <h2 className="font-semibold text-blue-950">生成结果</h2>
            <p className="mt-1 text-sm text-blue-800">上传教案后，系统将把课程内容整理为五类可继续编辑和使用的备课结果。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {outputCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className="rounded-xl bg-white p-4">
                    <Icon className="h-5 w-5 text-blue-600" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">{card.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
          <UploadPanel courseId={courseId} />
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">最近导入</h2>
            {course.imports.map((job) => (
              <div key={job.id} className="rounded-md border border-[var(--cx-border)] p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{job.originalName}</span>
                  <Link className="text-[var(--cx-blue)]" href={`/space/courses/${courseId}/ai-import/${job.id}`}>
                    查看
                  </Link>
                </div>
                <ImportTimeline status={job.status} errorMessage={job.errorMessage} retryHref={`/space/courses/${courseId}/ai-import`} />
              </div>
            ))}
          </section>
        </div>
      </section>
    </FanyaCourseShell>
  );
}
