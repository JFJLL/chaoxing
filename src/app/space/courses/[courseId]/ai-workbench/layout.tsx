import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ courseId: string }>;
};

export default async function AiWorkbenchLayout({ children, params }: LayoutProps) {
  const [user, { courseId }] = await Promise.all([requireUser(), params]);
  const course = await requireCourseAccess(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="ai-workbench">
      {children}
    </FanyaCourseShell>
  );
}
