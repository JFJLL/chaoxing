import { Bot, ClipboardList, LockKeyhole, PenLine, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isTeacher } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { LinkButton } from "@/components/ui/Button";

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
          answer: true,
          type: true,
          version: true,
          sourceArtifact: { select: { title: true, version: true } }
        }
      })
    : [];

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
        description="汇总已确认的 AI 题目；稳定题目 ID 可供组卷持续引用。"
        actions={<LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`}><Bot className="h-4 w-4" />AI出题</LinkButton>}
      >
        <div className="space-y-3">
          {questions.map((question) => (
            <article key={question.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <ScrollText className="h-6 w-6 text-emerald-600" />
              <h2 className="mt-3 font-semibold text-slate-900">{question.stem}</h2>
              <p className="mt-2 text-sm text-blue-700">答案：{question.answer}</p>
              <p className="mt-1 text-xs text-slate-400">
                {question.sourceArtifact?.title ?? "AI 题库"} · 题目 v{question.version} · 来源产物 v{question.sourceArtifact?.version ?? "-"} · {question.id}
              </p>
            </article>
          ))}
          {!questions.length ? <p className="text-sm text-slate-500">暂无题目，可使用 AI出题 生成。</p> : null}
        </div>
      </CourseModulePanel>
      )}
    </FanyaCourseShell>
  );
}
