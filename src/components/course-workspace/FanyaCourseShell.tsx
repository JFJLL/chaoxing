import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";
import { CourseWorkspaceHeader } from "@/components/course-workspace/CourseWorkspaceHeader";
import { CourseWorkspaceSidebar } from "@/components/course-workspace/CourseWorkspaceSidebar";

export function FanyaCourseShell({
  user,
  course,
  activeTab,
  children
}: {
  user: SessionUser;
  course: { id: string; title: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-[#eef7ff] via-[#f7fbff] to-[#eef3ff]">
      <CourseWorkspaceHeader user={user} />
      <div className="flex min-h-[calc(100vh-72px)] flex-col lg:flex-row">
        <CourseWorkspaceSidebar course={course} activeTab={activeTab} />
        <main className="min-w-0 flex-1 p-5 lg:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
