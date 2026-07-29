import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseDriveWorkspace } from "@/components/course-workspace/CourseDriveWorkspace";

type PageProps = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ parentId?: string }>;
};

export default async function CourseDrivePage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const { parentId } = await searchParams;
  const course = await requireCourseManager(user, courseId);

  return (
    <FanyaCourseShell user={user} course={course} activeTab="drive">
      <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-panel sm:p-6 lg:p-8">
        <header className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]">
            <HardDriveIcon />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">课程云盘</h1>
            <p className="mt-1 text-sm text-slate-500">管理《{course.title}》的课程资料、对话上传和 AI 产物。</p>
          </div>
        </header>
        <div className="mt-6">
          <CourseDriveWorkspace courseId={course.id} courseTitle={course.title} initialParentId={parentId} />
        </div>
      </section>
    </FanyaCourseShell>
  );
}

function HardDriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 12H2" />
      <path d="m5.45 5.11-2.9 5.8A2 2 0 0 0 2.3 12.2v4.6a2 2 0 0 0 2 2h15.4a2 2 0 0 0 2-2v-4.6a2 2 0 0 0-.25-1.29l-2.9-5.8A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
      <path d="M6 16h.01" />
      <path d="M10 16h.01" />
    </svg>
  );
}
