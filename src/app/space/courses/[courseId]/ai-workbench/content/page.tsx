import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { CourseDocumentImportSources } from "@/components/ai-import/CourseDocumentImportSources";
import { RecentImports } from "@/components/ai-import/RecentImports";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";
import { LinkButton } from "@/components/ui/Button";
import { ListTree } from "lucide-react";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function AiWorkbenchContentPage({ params }: PageProps) {
  const [user, { courseId }] = await Promise.all([requireUser(), params]);
  const course = await requireCourseManager(user, courseId);
  const recentImports = await RecentImports({ courseId });

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-8">
      <div className="space-y-6">
        <header className="flex flex-col gap-5 border-b border-[var(--cx-border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">课程内容与知识</h1>
            <p className="mt-1 text-sm text-slate-500">导入文档后生成课程结构与知识关系，并作为后续 AI 备课的依据。</p>
            <LinkButton
              href={`/space/courses/${course.id}/builder`}
              variant="secondary"
              className="mt-3 h-9"
            >
              <ListTree className="h-4 w-4" aria-hidden="true" />维护课程目录
            </LinkButton>
          </div>
          <PrepWorkflowNavigation courseId={course.id} workflow="content" active="import" />
        </header>
        <section className="rounded-2xl border border-[#F9ECE7] bg-[#FDF3F0]/70 p-5">
          <h2 className="font-semibold text-[#34130F]">一次导入，形成完整课程上下文</h2>
          <p className="mt-1 text-sm leading-6 text-[#6F281D]">系统会提炼课程目标、章节课时和知识关系；确认后可直接用于生成教案、题目和课件。</p>
        </section>
        <CourseDocumentImportSources courseId={courseId} />
        {recentImports}
      </div>
    </section>
  );
}
