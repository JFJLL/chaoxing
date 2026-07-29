import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AssessmentListClient } from "@/components/course-workspace/AssessmentListClient";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };
export default async function AssignmentsPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId } = await params; const course = await loadCourseWorkspace(user, courseId); const canManage = isCourseManagerRecord(user, course);
  const assignments = await db.assignment.findMany({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }) }, include: { _count: { select: { questions: true, submissions: true } } }, orderBy: { createdAt: "desc" } });
  return <FanyaCourseShell user={user} course={course} activeTab="assignments"><CourseModulePanel title="作业" description={canManage ? "从题库选题或手工出题，发布后查看提交并批改。" : "完成老师发布的作业，支持暂存和截止前提交。"} actions={<LinkButton href={`/space/courses/${courseId}/after-class`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回课后</LinkButton>}><AssessmentListClient kind="assignment" courseId={courseId} canManage={canManage} items={assignments.map((item) => ({ id: item.id, title: item.title, status: item.status, questionCount: item._count.questions, submissionCount: item._count.submissions, dueAt: item.dueAt?.toISOString() ?? null, allowLate: item.allowLate, immediateFeedback: item.immediateFeedback, resultPublishedAt: item.resultPublishedAt?.toISOString() ?? null }))} /></CourseModulePanel></FanyaCourseShell>;
}
import { ArrowLeft } from "lucide-react";
