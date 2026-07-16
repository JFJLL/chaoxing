import { requireUser } from "@/lib/auth";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { CopilotWorkspace } from "@/components/course-workspace/CopilotWorkspace";
import {
  getCopilotAnalytics,
  listCopilotConversations,
  listCopilotSkills,
  toCopilotConversationDto
} from "@/lib/courseWorkspace/copilot";
import { listCourseCopilotFiles, listOwnerDriveFolders } from "@/lib/copilot/files";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function CopilotPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const [conversations, skills, files, folders, analytics] = await Promise.all([
    listCopilotConversations(user, courseId),
    listCopilotSkills(user, courseId),
    listCourseCopilotFiles(user, courseId),
    canManage ? listOwnerDriveFolders(user) : Promise.resolve([]),
    canManage ? getCopilotAnalytics(user, courseId) : Promise.resolve(null)
  ]);

  const fileIds = new Set(files.map((file) => file.id));
  const conversationDtos = conversations.map(toCopilotConversationDto).map((conversation) => ({
    ...conversation,
    attachments: conversation.attachments.map((attachment) => ({
      ...attachment,
      available: Boolean(attachment.id && fileIds.has(attachment.id))
    }))
  }));

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel
        title="Copilot"
        description={canManage ? "测试课程 Copilot，管理 Skill 和课程云盘文件夹。" : "选择 Skill 和课程文件，让 Copilot 帮你完成学习任务。"}
      >
        <CopilotWorkspace
          courseId={courseId}
          canManage={canManage}
          initialFolderId={course.copilotFolderId}
          initialConversations={conversationDtos}
          initialSkills={skills.map((skill) => ({ ...skill, createdAt: skill.createdAt.toISOString(), updatedAt: skill.updatedAt.toISOString() }))}
          initialFiles={files}
          initialFolders={folders}
          initialAnalytics={analytics}
        />
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
