import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiWorkbench } from "@/components/course-workspace/AiWorkbench";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { Bot, Database, FileText, FolderOpen, LibraryBig, MessageCircle, Network, Presentation, Video } from "lucide-react";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function AiWorkbenchPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const prepEntries = [
    {
      title: "AI文档建课",
      description: "上传教案后生成大纲、课程目录、知识图谱、能力图谱和问题图谱。",
      href: `/space/courses/${course.id}/ai-import`,
      icon: Bot
    },
    {
      title: "AI课件",
      description: "基于教案或知识大纲生成课堂 PPT 内容。",
      href: `/space/courses/${course.id}/ai-workbench/apps/courseware`,
      icon: Presentation
    },
    {
      title: "HTML课件",
      description: "沿用当前 Gemini 能力生成可播放的互动课堂课件。",
      href: `/space/courses/${course.id}/html-courseware`,
      icon: FileText
    },
    {
      title: "课程资料库",
      description: "统一管理教材、参考资料、案例、项目和视频材料。",
      href: `/space/courses/${course.id}/resources`,
      icon: FolderOpen
    },
    {
      title: "知识图谱",
      description: "查看课程知识结构，辅助梳理知识点。",
      href: `/space/courses/${course.id}/knowledge-map`,
      icon: Network
    },
    {
      title: "AI助教",
      description: "基于课程资料和知识库提供问答与备课建议。",
      href: `/space/courses/${course.id}/ai-workbench`,
      icon: MessageCircle
    }
  ];
  const libraryEntries = [
    { title: "资料库", description: "教材、参考资料和教师上传材料", icon: FolderOpen },
    { title: "案例库", description: "课程案例和课堂分析材料", icon: LibraryBig },
    { title: "项目库", description: "课程项目与实践任务素材", icon: Database },
    { title: "慕课 / 参考视频", description: "外部课程与参考视频接入位", icon: Video }
  ];
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
      paperAssembly: course.aiArtifacts.filter((artifact) => artifact.appType === "paper_assembly").length,
      htmlCourseware: course.aiArtifacts.filter((artifact) => artifact.appType === "html_courseware").length
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
              <h1 className="mt-3 text-xl font-semibold text-slate-900">备课中心</h1>
              <p className="mt-1 text-sm text-slate-500">{course.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/ai-import`} variant="secondary">
                <Bot className="h-4 w-4" />
                AI 文档建课
              </LinkButton>
              <CoursePublishButton courseId={course.id} status={course.status} />
            </div>
          </section>
        ) : null}
        {canManage ? (
          <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-5">
              <h2 className="text-xl font-semibold text-slate-950">备课资源与 AI 能力</h2>
              <p className="text-sm text-slate-500">把文档建课、课件生成、资料库和 AI 助教收敛到课程备课中心。</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {prepEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <a key={entry.title} href={entry.href} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:border-blue-100 hover:bg-blue-50/50">
                    <Icon className="h-7 w-7 text-[#2165f3]" />
                    <h3 className="mt-4 font-semibold text-slate-950">{entry.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p>
                  </a>
                );
              })}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {libraryEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <div key={entry.title} className="rounded-2xl border border-slate-100 p-4">
                    <Icon className="h-5 w-5 text-slate-500" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">{entry.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{entry.description}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        <AiWorkbench courseId={course.id} context={context} canManage={canManage} />
      </div>
    </FanyaCourseShell>
  );
}
