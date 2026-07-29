import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { htmlCoursewarePayloadSchema, type HtmlCoursewarePayload } from "@/types/courseWorkspace";
import { LinkButton } from "@/components/ui/Button";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function HtmlCoursewarePage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  if (!canManage) redirect(`/space/courses/${courseId}/after-class`);
  const artifact = await db.courseAiArtifact.findFirst({
    where: { courseId, appType: "html_courseware", status: { in: ["APPROVED", "PUBLISHED"] } },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }]
  });
  let payload: HtmlCoursewarePayload | null = null;
  try {
    payload = artifact?.payload ? htmlCoursewarePayloadSchema.parse(JSON.parse(artifact.payload)) : null;
  } catch {
    payload = null;
  }

  return (
    <FanyaCourseShell user={user} course={course} activeTab="html-courseware">
      <section className="space-y-5">
        <div className="rounded-[28px] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">历史互动课件</h1>
              <p className="mt-1 text-sm text-slate-500">{payload ? `历史课件共 ${payload.slideCount} 页，仅保留查看。` : "HTML 课件已停止生成，请使用 PPT 课件。"}</p>
            </div>
            {canManage ? <PrepWorkflowNavigation courseId={course.id} workflow="courseware" active="published" /> : null}
          </div>
        </div>
        {payload ? (
          <iframe
            title={artifact?.title ?? "互动课件"}
            srcDoc={payload.html}
            sandbox="allow-scripts"
            className="h-[calc(100vh-240px)] min-h-[520px] w-full rounded-[28px] border border-slate-100 bg-white shadow-sm"
          />
        ) : (
          <div className="rounded-[28px] bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">暂无历史互动课件。</p>{canManage ? <LinkButton className="mt-4" href={`/space/courses/${course.id}/ai-workbench/apps/ppt_courseware`}>前往 PPT 课件</LinkButton> : null}</div>
        )}
      </section>
    </FanyaCourseShell>
  );
}
