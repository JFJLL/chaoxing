import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { AiTutorWorkspace } from "@/components/course-workspace/AiTutorWorkspace";
import { TeacherPrepWorkbench, type PrepWorkItem } from "@/components/course-workspace/TeacherPrepWorkbench";
import { Badge } from "@/components/ui/Badge";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { enabledGeneratorCapabilities } from "@/lib/courseWorkspace/capabilities";
import { listTutorConversations, toTutorConversationDto } from "@/lib/courseWorkspace/aiConversation";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

const importStatusLabels: Record<string, string> = {
  QUEUED: "等待处理",
  EXTRACTING: "正在解析",
  GENERATING: "正在生成",
  STRUCTURING: "正在生成目录",
  MAPPING: "正在生成图谱",
  READY_FOR_REVIEW: "待确认",
  FAILED: "需要处理"
};

const artifactStatusLabels: Record<string, string> = {
  QUEUED: "等待生成",
  GENERATING: "正在生成",
  DRAFT: "草稿待确认",
  FAILED: "生成失败",
  APPROVED: "已确认"
};

function taskTone(status: string): PrepWorkItem["tone"] {
  if (status === "FAILED") return "red";
  if (status === "READY_FOR_REVIEW" || status === "DRAFT") return "orange";
  if (status === "QUEUED" || status === "EXTRACTING" || status === "GENERATING" || status === "STRUCTURING" || status === "MAPPING") return "blue";
  return "slate";
}

export default async function AiWorkbenchPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  if (!canManage) {
    const initialTutorConversations = (await listTutorConversations(user, course.id)).map(toTutorConversationDto);
    return (
      <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
        <AiTutorWorkspace courseId={course.id} courseTitle={course.title} initialConversations={initialTutorConversations} />
      </FanyaCourseShell>
    );
  }

  const importJobs = await db.documentImportJob.findMany({
    where: { courseId: course.id, status: { not: "APPLIED" } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: { id: true, originalName: true, status: true, currentStage: true, updatedAt: true }
  });
  const seenImportTasks = new Set<string>();
  const importWorkItems: PrepWorkItem[] = importJobs.filter((job) => {
    const taskKey = `${job.originalName}:${job.status}`;
    if (seenImportTasks.has(taskKey)) return false;
    seenImportTasks.add(taskKey);
    return true;
  }).map((job) => ({
    id: `import-${job.id}`,
    title: job.originalName,
    status: importStatusLabels[job.status] ?? "继续处理",
    detail: job.currentStage ?? "继续完成文档建课流程",
    href: `/space/courses/${course.id}/ai-import/${job.id}`,
    updatedAt: job.updatedAt.toISOString(),
    tone: taskTone(job.status)
  }));
  const artifactWorkItems: PrepWorkItem[] = course.aiArtifacts.flatMap((artifact) => {
    if (!artifactStatusLabels[artifact.status]) return [];
    const capability = enabledGeneratorCapabilities.find((item) => item.appType === artifact.appType);
    if (!capability) return [];
    return [{
      id: `artifact-${artifact.id}`,
      title: artifact.title,
      status: artifactStatusLabels[artifact.status],
      detail: `${capability.title} · ${artifact.status === "APPROVED" ? "内容已确认，可继续查看" : "继续完成生成、编辑和确认"}`,
      href: capability.route(course.id),
      updatedAt: artifact.updatedAt.toISOString(),
      tone: taskTone(artifact.status)
    }];
  });
  const workItems = [...importWorkItems, ...artifactWorkItems]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 4);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      <div className="space-y-5">
        <section className="flex flex-col gap-3 rounded-[28px] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge tone={course.status === "ACTIVE" ? "green" : "orange"}>{course.status === "ACTIVE" ? "已发布" : "草稿"}</Badge>
            <h1 className="mt-3 text-xl font-semibold text-slate-900">备课中心</h1>
            <p className="mt-1 text-sm text-slate-500">{course.title}</p>
          </div>
          <CoursePublishButton courseId={course.id} status={course.status} />
        </section>
        <TeacherPrepWorkbench courseId={course.id} workItems={workItems} />
      </div>
    </FanyaCourseShell>
  );
}
