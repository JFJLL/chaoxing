import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiWorkbench } from "@/components/course-workspace/AiWorkbench";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { Bot, Hammer } from "lucide-react";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function AiWorkbenchPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && course.ownerId === user.id;
  const context = {
    courseTitle: course.title,
    chapterCount: course.chapters.length,
    lessonCount: course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0),
    resourceCount: course.resources.length,
    studentCount: course.enrollments.length,
    announcementCount: course.announcements.length,
    artifactCounts: {
      questionGeneration: course.aiArtifacts.filter((artifact) => artifact.appType === "question_generation").length,
      lessonPlan: course.aiArtifacts.filter((artifact) => artifact.appType === "lesson_plan").length,
      courseware: course.aiArtifacts.filter((artifact) => artifact.appType === "courseware").length,
      paperAssembly: course.aiArtifacts.filter((artifact) => artifact.appType === "paper_assembly").length
    },
    chapters: course.chapters.map((chapter) => ({ title: chapter.title, lessonCount: chapter.lessons.length })),
    recentArtifacts: course.aiArtifacts.slice(0, 8).map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      appType: artifact.appType,
      createdAt: artifact.createdAt.toISOString()
    }))
  };

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <div className="space-y-5">
        {canManage ? (
          <section className="flex flex-col gap-3 rounded-[28px] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge tone={course.status === "ACTIVE" ? "green" : "orange"}>{course.status === "ACTIVE" ? "已发布" : "草稿"}</Badge>
              <h1 className="mt-3 text-xl font-semibold text-slate-900">{course.title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/builder`} variant="secondary">
                <Hammer className="h-4 w-4" />
                课程建设
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/ai-import`} variant="secondary">
                <Bot className="h-4 w-4" />
                AI 文档建课
              </LinkButton>
              <CoursePublishButton courseId={course.id} status={course.status} />
            </div>
          </section>
        ) : null}
        <AiWorkbench courseId={course.id} context={context} />
      </div>
    </FanyaCourseShell>
  );
}
