import { ArrowLeft, Bot, ClipboardList, LockKeyhole, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";
import { QuestionBankClient } from "@/components/course-workspace/QuestionBankClient";
import { parseOptions } from "@/lib/teaching/assessmentInput";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function QuestionBankPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const questions = canManage
    ? await db.courseQuestion.findMany({
        where: { courseId, status: "APPROVED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          stem: true,
          options: true,
          answer: true,
          explanation: true,
          type: true,
          version: true,
          sourceArtifact: { select: { title: true, version: true } }
        }
      })
    : [];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="question-bank">
      {!canManage ? (
        <CourseModulePanel title="题库" description="题库由教师维护，学生请前往作业或考试完成学习任务。" breadcrumbs={<CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current="题库" parent={{ label: "课后", href: `/space/courses/${course.id}/after-class` }} />}>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
            <LockKeyhole className="h-8 w-8 text-slate-500" />
            <h2 className="mt-4 font-semibold text-slate-900">学生端不开放题库维护视图</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">你可以继续查看老师发布的作业和考试；题目维护、AI出题和题库汇总保留在教师端。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/assignments`} variant="secondary">
                <PenLine className="h-4 w-4" />
                去作业
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/exams`}>
                <ClipboardList className="h-4 w-4" />
                去考试
              </LinkButton>
            </div>
          </div>
        </CourseModulePanel>
      ) : (
      <CourseModulePanel
        title="题库"
        description="汇总已确认的 AI 题目；稳定题目 ID 可供组卷持续引用。"
        breadcrumbs={<CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current="题库" parent={{ label: "课后", href: `/space/courses/${course.id}/after-class` }} />}
        actions={<div className="flex flex-wrap gap-2"><LinkButton href={`/space/courses/${course.id}/after-class`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回课后</LinkButton><LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}><Bot className="h-4 w-4" />AI出题</LinkButton></div>}
      >
        <QuestionBankClient courseId={courseId} initialQuestions={questions.map((question) => ({ id: question.id, type: question.type as "single_choice" | "multiple_choice" | "short_answer", stem: question.stem, options: parseOptions(question.options), answer: question.answer, explanation: question.explanation, version: question.version, sourceTitle: question.sourceArtifact?.title ?? "AI 题库", sourceVersion: question.sourceArtifact?.version ?? null }))} />
      </CourseModulePanel>
      )}
    </FanyaCourseShell>
  );
}
