import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { parseOptions } from "@/lib/teaching/assessmentInput";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AssessmentDetailClient } from "@/components/course-workspace/AssessmentDetailClient";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string; assignmentId: string }> };
export default async function AssignmentDetailPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId, assignmentId } = await params; const course = await loadCourseWorkspace(user, courseId); const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const assignment = await db.assignment.findFirst({ where: { id: assignmentId, courseId, ...(canManage ? {} : { status: "PUBLISHED" }) }, include: { questions: { orderBy: { order: "asc" } }, extensions: true, submissions: { where: canManage ? {} : { userId: user.id }, include: { user: { select: { name: true } }, answers: { include: { question: { select: { points: true } } } } }, orderBy: { updatedAt: "desc" } } } });
  if (!assignment || (!canManage && assignment.publishAt && assignment.publishAt > new Date())) notFound();
  const studentRecord = canManage ? null : assignment.submissions[0] ?? null; const resultVisible = canManage || Boolean(studentRecord && (assignment.immediateFeedback || assignment.resultPublishedAt));
  const toRecord = (submission: typeof assignment.submissions[number]) => ({ id: submission.id, userName: submission.user.name, status: submission.status, score: submission.score, feedback: submission.feedback, submittedAt: submission.submittedAt?.toISOString() ?? null, answers: submission.answers.map((answer) => ({ id: answer.id, questionId: answer.questionId, response: answer.response, score: answer.score, feedback: answer.feedback, maxPoints: answer.question.points })) });
  return <FanyaCourseShell user={user} course={course} activeTab="assignments"><CourseModulePanel title="作业详情" description={canManage ? "查看学生提交并完成主观题批改。" : "可暂存答案，确认后正式提交。"} actions={<LinkButton href={`/space/courses/${courseId}/assignments`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回作业</LinkButton>}><AssessmentDetailClient kind="assignment" courseId={courseId} itemId={assignmentId} status={assignment.status} canManage={canManage} title={assignment.title} instructions={assignment.instructions} questions={assignment.questions.map((question) => ({ id: question.id, type: question.type, stem: question.stem, options: parseOptions(question.options), points: question.points, ...(resultVisible ? { answer: question.answer, explanation: question.explanation } : {}) }))} record={studentRecord ? toRecord(studentRecord) : null} records={canManage ? assignment.submissions.map(toRecord) : []} resultVisible={resultVisible} extensionStudents={canManage ? course.enrollments.map((enrollment) => ({ id: enrollment.userId, name: enrollment.user.name, dueAt: assignment.extensions.find((extension) => extension.userId === enrollment.userId)?.dueAt.toISOString() ?? null })) : []} /></CourseModulePanel></FanyaCourseShell>;
}
