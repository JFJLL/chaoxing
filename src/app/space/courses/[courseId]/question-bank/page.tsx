import { ClipboardList, LockKeyhole, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";
import { QuestionBankClient } from "@/components/course-workspace/QuestionBankClient";
import { parseOptions } from "@/lib/teaching/assessmentInput";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function QuestionBankPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
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
    <FanyaCourseShell user={user} course={course} activeTab={canManage ? "ai-workbench" : "question-bank"}>
      {!canManage ? (
        <CourseModulePanel title="题库" description="题库由教师维护，学生请前往作业或考试完成学习任务。">
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
        title="AI出题与组卷"
        description="审核 AI 生成题目；确认后的题目会直接进入智能组卷。"
        actions={<PrepWorkflowNavigation courseId={course.id} workflow="assessment" active="question-bank" />}
      >
        <QuestionBankClient courseId={courseId} initialQuestions={questions.map((question) => ({ id: question.id, type: question.type as "single_choice" | "multiple_choice" | "short_answer", stem: question.stem, options: parseOptions(question.options), answer: question.answer, explanation: question.explanation, version: question.version, sourceTitle: question.sourceArtifact?.title ?? "AI 题库", sourceVersion: question.sourceArtifact?.version ?? null }))} />
      </CourseModulePanel>
      )}
    </FanyaCourseShell>
  );
}
