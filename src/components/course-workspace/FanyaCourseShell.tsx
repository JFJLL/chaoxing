import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";
import { isTeacher } from "@/lib/permissions";
import { CourseWorkspaceHeader } from "@/components/course-workspace/CourseWorkspaceHeader";
import { CourseWorkspaceSidebar } from "@/components/course-workspace/CourseWorkspaceSidebar";

export function FanyaCourseShell({
  user,
  course,
  activeTab,
  children
}: {
  user: SessionUser;
  course: { id: string; title: string; ownerId: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
  children: ReactNode;
}) {
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--cx-course-page)]">
      <CourseWorkspaceHeader user={user} />
      <div className="flex min-h-[calc(100vh-72px)] flex-col lg:flex-row">
        <CourseWorkspaceSidebar canManage={canManage} course={course} activeTab={activeTab} />
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,rgba(86,105,201,0.08),transparent_34%),var(--cx-course-page)] p-4 sm:p-5 lg:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
