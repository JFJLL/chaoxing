import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CourseTabs } from "@/components/courses/CourseTabs";
import { CourseCard } from "@/components/courses/CourseCard";
import { NewCourseDialog } from "@/components/courses/NewCourseDialog";
import { AddCourseDialog } from "@/components/courses/AddCourseDialog";
import { CourseFolderDialog } from "@/components/courses/CourseFolderDialog";
import { EmptyState } from "@/components/ui/EmptyState";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function CoursesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params.tab === "taught" ? "taught" : "learned";
  const user = await requireUser();

  const courses =
    activeTab === "taught"
      ? await db.course.findMany({
          where: { ownerId: user.id },
          include: { owner: true, enrollments: true },
          orderBy: { updatedAt: "desc" }
        })
      : (
          await db.courseEnrollment.findMany({
            where: { userId: user.id },
            include: { course: { include: { owner: true } } },
            orderBy: { updatedAt: "desc" }
          })
        ).map((enrollment) => ({
          ...enrollment.course,
          progress: enrollment.progress
        }));

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">课程</h1>
          <p className="mt-1 text-sm text-slate-500">管理学习课程与教师课程空间</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "taught" ? (
            <NewCourseDialog />
          ) : (
            <AddCourseDialog />
          )}
          <CourseFolderDialog />
        </div>
      </header>

      <CourseTabs active={activeTab} />

      {courses.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} mode={activeTab} />
          ))}
        </section>
      ) : (
        <EmptyState
          title={activeTab === "taught" ? "暂无我教的课" : "暂无我学的课"}
          description={activeTab === "taught" ? "新建课程后可继续使用 AI 文档建课。" : "通过邀请码添加课程后会显示学习进度。"}
        />
      )}
    </div>
  );
}
