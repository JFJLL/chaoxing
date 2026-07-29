import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { NoticesClient } from "@/components/course-workspace/NoticesClient";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function NoticesPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const now = new Date();
  const notices = await db.announcement.findMany({
    where: { courseId, ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: now } }] }) },
    include: { author: { select: { name: true } }, reads: canManage ? { where: { user: { enrollments: { some: { courseId } } } }, select: { userId: true, readAt: true } } : { where: { userId: user.id }, select: { userId: true, readAt: true } } },
    orderBy: [{ pinned: "desc" }, { publishAt: "desc" }, { createdAt: "desc" }]
  });

  return (
    <FanyaCourseShell user={user} course={course} activeTab="notices">
      <CourseModulePanel title="通知" description={canManage ? "发布课程公告并查看学生已读情况。" : "查看课程公告和教学提醒。"}>
        <NoticesClient courseId={courseId} canManage={canManage} students={canManage ? course.enrollments.map((item) => ({ id: item.user.id, name: item.user.name })) : []} notices={notices.map((notice) => ({ id: notice.id, title: notice.title, body: notice.body, status: notice.status, publishAt: notice.publishAt?.toISOString() ?? null, pinned: notice.pinned, authorName: notice.author.name, readAt: notice.reads.find((read) => read.userId === user.id)?.readAt.toISOString() ?? null, readCount: notice.reads.length, readerIds: notice.reads.map((read) => read.userId) }))} />
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
