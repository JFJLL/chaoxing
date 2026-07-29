import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";
import { CourseResourceUpload } from "@/components/course-workspace/CourseResourceUpload";
import { CourseResourceLibraries } from "@/components/course-workspace/CourseResourceLibraries";
import { CourseResourceCard } from "@/components/course-workspace/CourseResourceCard";
import { listCourseDrivePicker } from "@/lib/courseDrive/service";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function ResourcesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const allResources = await db.resource.findMany({
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
  const visibleDriveFileIds = canManage
    ? null
    : new Set((await listCourseDrivePicker(user, course.id)).map((item) => item.id));
  const resources = canManage
    ? allResources
    : allResources.filter((resource) => resource.driveFile && visibleDriveFileIds?.has(resource.driveFile.id));

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
          {canManage || resources.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {canManage ? <CourseResourceUpload courseId={course.id} folderConfigured={Boolean(course.driveRootFolderId)} /> : null}
              {resources.map((resource) => <CourseResourceCard key={resource.id} resource={resource} />)}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              <p className="font-medium text-slate-800">还没有课程资料</p>
              <p className="mt-1 text-sm text-slate-500">从“导入课程文档”开始，确认后的内容会成为教案、题目和课件的生成依据。</p>
            </div>
          )}
        </section>
        {canManage ? (
          <section className="mt-8 border-t border-slate-100 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">扩展资料库</h2>
            <p className="mt-1 text-sm text-slate-500">按需创建课程根目录下的资料库，创建后可直接进入对应文件夹。</p>
            <div className="mt-4">
              <CourseResourceLibraries courseId={course.id} />
            </div>
          </section>
        ) : null}
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
