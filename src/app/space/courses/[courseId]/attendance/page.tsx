import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AttendanceClient } from "@/components/course-workspace/AttendanceClient";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AttendancePage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const sessions = await db.attendanceSession.findMany({
    where: { courseId, ...(canManage ? {} : { status: { in: ["ACTIVE", "ENDED"] } }) },
    include: { records: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" }
  });
  const now = new Date();
  return <FanyaCourseShell user={user} course={course} activeTab="activities"><CourseModulePanel title="签到" description={canManage ? "创建动态二维码签到并实时管理出勤状态。" : "扫描教师二维码或输入 6 位短码完成签到。"} actions={<LinkButton href={`/space/courses/${courseId}/activities`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回上课</LinkButton>}><AttendanceClient courseId={courseId} canManage={canManage} students={canManage ? course.enrollments.map((item) => ({ id: item.user.id, name: item.user.name })) : []} sessions={sessions.map((session) => ({ id: session.id, title: session.title, status: session.status === "ACTIVE" && session.endsAt && session.endsAt <= now ? "ENDED" : session.status, startsAt: session.startsAt?.toISOString() ?? null, endsAt: session.endsAt?.toISOString() ?? null, records: session.records.map((record) => ({ userId: record.userId, name: record.user.name, status: record.status, signedAt: record.signedAt?.toISOString() ?? null })), myStatus: session.records.find((record) => record.userId === user.id)?.status ?? null }))} /></CourseModulePanel></FanyaCourseShell>;
}
import { ArrowLeft } from "lucide-react";
