import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { parseOptions } from "@/lib/teaching/assessmentInput";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AssessmentDetailClient } from "@/components/course-workspace/AssessmentDetailClient";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string; examId: string }> };
export default async function ExamDetailPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId, examId } = await params; const course = await loadCourseWorkspace(user, courseId); const canManage = isCourseManagerRecord(user, course);
  const exam = await db.exam.findFirst({ where: { id: examId, courseId, ...(canManage ? {} : { status: "PUBLISHED" }) }, include: { questions: { orderBy: { order: "asc" } }, attempts: { where: canManage ? {} : { userId: user.id }, include: { user: { select: { name: true } }, answers: { include: { question: { select: { points: true } } } } }, orderBy: { updatedAt: "desc" } } } }); if (!exam) notFound();
  const studentRecord = canManage ? null : exam.attempts[0] ?? null; const resultVisible = canManage || Boolean(studentRecord && exam.resultPublishedAt); const deadline = studentRecord ? new Date(Math.min(studentRecord.startedAt.getTime() + exam.durationMinutes * 60_000, exam.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER)).toISOString() : null;
  const toRecord = (attempt: typeof exam.attempts[number]) => ({ id: attempt.id, userName: attempt.user.name, status: attempt.status, score: attempt.score, feedback: attempt.feedback, submittedAt: attempt.submittedAt?.toISOString() ?? null, answers: attempt.answers.map((answer) => ({ id: answer.id, questionId: answer.questionId, response: answer.response, score: answer.score, feedback: answer.feedback, maxPoints: answer.question.points })) });
  return <FanyaCourseShell user={user} course={course} activeTab="exams"><CourseModulePanel title="考试详情" description={canManage ? "查看答卷、完成批改并统一发布成绩。" : "考试只有一次正式作答机会，计时结束后自动提交。"} actions={<LinkButton href={`/space/courses/${courseId}/exams`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回考试</LinkButton>}><AssessmentDetailClient kind="exam" courseId={courseId} itemId={examId} status={exam.status} canManage={canManage} title={exam.title} instructions={exam.instructions} questions={exam.questions.map((question) => ({ id: question.id, type: question.type, stem: question.stem, options: parseOptions(question.options), points: question.points, ...(resultVisible ? { answer: question.answer, explanation: question.explanation } : {}) }))} record={studentRecord ? toRecord(studentRecord) : null} records={canManage ? exam.attempts.map(toRecord) : []} resultVisible={resultVisible} deadline={deadline} /></CourseModulePanel></FanyaCourseShell>;
}
