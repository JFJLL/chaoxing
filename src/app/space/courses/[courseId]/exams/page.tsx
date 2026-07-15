import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AssessmentListClient } from "@/components/course-workspace/AssessmentListClient";

type PageProps = { params: Promise<{ courseId: string }> };
export default async function ExamsPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId } = await params; const course = await loadCourseWorkspace(user, courseId); const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const [exams, questions, paperSources] = await Promise.all([
    db.exam.findMany({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) }, include: { _count: { select: { questions: true, attempts: true } } }, orderBy: { createdAt: "desc" } }),
    canManage ? db.courseQuestion.findMany({ where: { courseId, status: "APPROVED" }, select: { id: true, type: true, stem: true }, orderBy: { updatedAt: "desc" } }) : Promise.resolve([]),
    canManage ? db.courseAiArtifact.findMany({ where: { courseId, appType: "paper_assembly", status: { in: ["APPROVED", "PUBLISHED"] } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }) : Promise.resolve([])
  ]);
  return <FanyaCourseShell user={user} course={course} activeTab="exams"><CourseModulePanel title="考试" description={canManage ? "配置正式考试、统一批改并发布成绩。" : "在规定时间内完成一次正式作答。"}><AssessmentListClient kind="exam" courseId={courseId} canManage={canManage} sourceQuestions={questions} paperSources={paperSources} items={exams.map((item) => ({ id: item.id, title: item.title, status: item.status, questionCount: item._count.questions, submissionCount: item._count.attempts, startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null, durationMinutes: item.durationMinutes, resultPublishedAt: item.resultPublishedAt?.toISOString() ?? null }))} /></CourseModulePanel></FanyaCourseShell>;
}
