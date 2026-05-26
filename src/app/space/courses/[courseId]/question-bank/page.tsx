import { Bot, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
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
  const questions = course.aiArtifacts
    .filter((artifact) => artifact.appType === "question_generation")
    .flatMap((artifact) => questionsFromPayload(artifact.payload).map((question) => ({ ...question, artifactTitle: artifact.title })));

  return (
    <FanyaCourseShell user={user} course={course} activeTab="question-bank">
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
    </FanyaCourseShell>
  );
}
