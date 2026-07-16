import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { htmlCoursewarePayloadSchema, type HtmlCoursewarePayload } from "@/types/courseWorkspace";
import { isTeacher } from "@/lib/permissions";
import { LinkButton } from "@/components/ui/Button";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function HtmlCoursewarePage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const artifact = await db.courseAiArtifact.findFirst({
    where: { courseId, appType: "html_courseware", status: "PUBLISHED" },
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
          <CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current="已发布互动课件" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">已发布互动课件</h1>
          {payload ? <p className="mt-2 text-sm text-slate-500">共 {payload.slideCount} 页，支持键盘方向键播放。</p> : null}
        </div>
        {payload ? (
          <iframe
            title={artifact?.title ?? "互动课件"}
            srcDoc={payload.html}
            sandbox="allow-scripts"
            className="h-[calc(100vh-240px)] min-h-[520px] w-full rounded-[28px] border border-slate-100 bg-white shadow-sm"
          />
        ) : (
          <div className="rounded-[28px] bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">暂无已发布互动课件。</p>{canManage ? <LinkButton className="mt-4" href={`/space/courses/${course.id}/ai-workbench/apps/html_courseware`}>生成互动课件</LinkButton> : null}</div>
        )}
      </section>
    </FanyaCourseShell>
  );
}
