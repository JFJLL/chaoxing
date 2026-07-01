import { Bot, ClipboardList, LockKeyhole, PenLine, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";
import type { AiQuestionPayload } from "@/types/courseWorkspace";

type PageProps = { params: Promise<{ courseId: string }> };

function questionsFromPayload(payload: string) {
  try {
    return (JSON.parse(payload) as AiQuestionPayload).questions ?? [];
  } catch {
    return [];
  }
}

export default async function QuestionBankPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const questions = course.aiArtifacts
    .filter((artifact) => artifact.appType === "question_generation")
    .flatMap((artifact) => questionsFromPayload(artifact.payload).map((question) => ({ ...question, artifactTitle: artifact.title })));

  return (
    <FanyaCourseShell user={user} course={course} activeTab="question-bank">
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
        title="题库"
        description="汇总 AI 出题生成的本地题目。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}><Bot className="h-4 w-4" />AI出题</LinkButton>}
      >
        <div className="space-y-3">
          {questions.map((question, index) => (
            <article key={`${question.artifactTitle}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <ScrollText className="h-6 w-6 text-emerald-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{question.stem}</h2>
              <p className="mt-2 text-sm text-blue-700">答案：{question.answer}</p>
              <p className="mt-1 text-xs text-slate-400">{question.artifactTitle}</p>
            </article>
          ))}
          {!questions.length ? <p className="text-sm text-slate-500">暂无题目，可使用 AI出题 生成。</p> : null}
        </div>
      </CourseModulePanel>
      )}
    </FanyaCourseShell>
  );
}
