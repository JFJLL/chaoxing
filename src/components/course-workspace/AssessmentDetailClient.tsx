"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, GitBranch, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { AssessmentQuestionEditor, type EditableAssessmentQuestion } from "@/components/course-workspace/AssessmentQuestionEditor";
import { choiceKey, choiceLabel } from "@/lib/teaching/choiceQuestions";

type QuestionDto = {
  id: string;
  type: string;
  stem: string;
  options: string[];
  points: number;
  answer?: string;
  explanation?: string;
};

type RecordAnswerDto = {
  id: string;
  questionId: string;
  response: string;
  score: number | null;
  feedback: string | null;
  maxPoints: number;
};

type RecordDto = {
  id: string;
  userName: string;
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  answers: RecordAnswerDto[];
};

type ExtensionStudent = { id: string; name: string; dueAt: string | null };

export function AssessmentDetailClient({
  kind,
  courseId,
  itemId,
  status,
  canManage,
  title,
  instructions,
  questions,
  record,
  records,
  resultVisible,
  deadline,
  extensionStudents = []
}: {
  kind: "assignment" | "exam";
  courseId: string;
  itemId: string;
  status: string;
  canManage: boolean;
  title: string;
  instructions: string | null;
  questions: QuestionDto[];
  record: RecordDto | null;
  records: RecordDto[];
  resultVisible: boolean;
  deadline?: string | null;
  extensionStudents?: ExtensionStudent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>(() =>
    Object.fromEntries((record?.answers ?? []).map((answer) => [answer.questionId, answer.response]))
  );
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftInstructions, setDraftInstructions] = useState(instructions ?? "");
  const [draftQuestions, setDraftQuestions] = useState<EditableAssessmentQuestion[]>(() => questions.map((question) => ({ ...question, sourceQuestionId: null, type: question.type as EditableAssessmentQuestion["type"], answer: question.answer ?? "", explanation: question.explanation ?? "" })));
  const [extensionTarget, setExtensionTarget] = useState<ExtensionStudent | null>(null);
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  const [remaining, setRemaining] = useState<number | null>(deadline && record?.status === "IN_PROGRESS" ? Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)) : null);
  const plural = kind === "assignment" ? "assignments" : "exams";
  const endpoint = kind === "assignment"
    ? `/api/courses/${courseId}/assignments/${itemId}/submission`
    : `/api/courses/${courseId}/exams/${itemId}/attempt`;

  async function request(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string; itemId?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setMessage("操作成功");
      router.refresh();
      return body ?? {};
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveOrSubmit(action: "SAVE" | "SUBMIT", current = responsesRef.current) {
    await request(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, answers: questions.map((question) => ({ questionId: question.id, response: current[question.id] ?? "" })) })
    });
  }

  useEffect(() => {
    if (!deadline || canManage || record?.status !== "IN_PROGRESS") { setRemaining(null); return; }
    setRemaining(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)));
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(timer);
        void saveOrSubmit("SUBMIT");
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // The deadline and record status define one exam timer lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, canManage, record?.status]);

  function updateMultiple(questionId: string, option: string, checked: boolean) {
    const values = new Set((responses[questionId] ?? "").split(",").filter(Boolean));
    if (checked) values.add(option); else values.delete(option);
    setResponses((current) => ({ ...current, [questionId]: [...values].join(",") }));
  }

  async function grade(target: RecordDto, formData: FormData) {
    const answers = target.answers.map((answer) => ({
      answerId: answer.id,
      score: Number(formData.get(`score-${answer.id}`) ?? answer.score ?? 0),
      feedback: String(formData.get(`feedback-${answer.id}`) ?? "")
    }));
    const url = kind === "assignment"
      ? `/api/courses/${courseId}/assignments/${itemId}/submissions/${target.id}/grade`
      : `/api/courses/${courseId}/exams/${itemId}/attempts/${target.id}/grade`;
    await request(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: formData.get("feedback"), answers }) });
  }

  async function saveDraft() {
    await request(`/api/courses/${courseId}/${plural}/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UPDATE_CONTENT",
        title: draftTitle,
        instructions: draftInstructions,
        questions: draftQuestions.map((question) => ({
          type: question.type,
          stem: question.stem.trim(),
          options: question.type === "short_answer" ? undefined : question.options.map((option) => option.trim()).filter(Boolean),
          answer: question.answer.trim(),
          explanation: question.explanation.trim(),
          points: question.points
        }))
      })
    });
  }

  async function createRevision() {
    const result = await request(`/api/courses/${courseId}/${plural}/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CREATE_REVISION" })
    });
    if (result?.itemId) router.push(`/space/courses/${courseId}/${plural}/${result.itemId}`);
  }

  async function extendStudent(formData: FormData) {
    if (!extensionTarget) return;
    const value = String(formData.get("dueAt") || "");
    let dueAt: string | null = null;
    if (value.trim()) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) { setError("截止时间格式无效"); return; }
      dueAt = date.toISOString();
    }
    if (await request(`/api/courses/${courseId}/assignments/${itemId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "EXTEND", userId: extensionTarget.id, dueAt }) })) setExtensionTarget(null);
  }

  async function returnSubmission(target: RecordDto) {
    await request(`/api/courses/${courseId}/assignments/${itemId}/submissions/${target.id}/return`, { method: "PUT" });
  }

  const editable = !canManage && (kind === "assignment"
    ? !record || ["DRAFT", "RETURNED"].includes(record.status)
    : record?.status === "IN_PROGRESS");

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-slate-900">{title}</h2>{canManage ? <Badge tone={status === "PUBLISHED" ? "green" : status === "DRAFT" ? "orange" : "gray"}>{status === "PUBLISHED" ? "已发布" : status === "DRAFT" ? "草稿" : "已撤回"}</Badge> : null}</div>{instructions ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{instructions}</p> : null}</div>
          <div className="flex items-center gap-2">{canManage && status !== "DRAFT" ? <Button type="button" variant="secondary" disabled={busy} onClick={createRevision}><GitBranch className="h-4 w-4" />创建可编辑版本</Button> : null}{remaining !== null ? <Badge tone={remaining > 300 ? "blue" : "orange"}><Clock3 className="mr-1 inline h-3.5 w-3.5" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Badge> : null}</div>
        </div>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}

      {canManage && status === "DRAFT" ? (
        <section className="space-y-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
          <div><h2 className="font-semibold text-slate-900">编辑发布前内容</h2><p className="mt-1 text-sm text-slate-500">修改只影响当前草稿；发布后将保留学生答卷对应的题目快照。</p></div>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">标题</span><Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="输入标题" /></label>
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">说明</span><Textarea value={draftInstructions} onChange={(event) => setDraftInstructions(event.target.value)} className="min-h-24" placeholder="输入任务要求或考试说明" /></label>
          </div>
          <AssessmentQuestionEditor title="题目列表" questions={draftQuestions} onChange={setDraftQuestions} />
          <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"><Button type="button" disabled={busy || !draftTitle.trim()} onClick={saveDraft}><Save className="h-4 w-4" />保存修改</Button></div>
        </section>
      ) : canManage ? (
        <section className="space-y-4">
          {kind === "assignment" && extensionStudents.length ? <div className="rounded-2xl border border-slate-100 bg-white p-4"><h2 className="font-semibold text-slate-900">个别学生延期</h2><div className="mt-3 flex flex-wrap gap-2">{extensionStudents.map((student) => <Button key={student.id} type="button" variant="secondary" className="h-8" onClick={() => setExtensionTarget(student)}>{student.name}{student.dueAt ? ` · ${new Date(student.dueAt).toLocaleString("zh-CN")}` : ""}</Button>)}</div></div> : null}
          <h2 className="font-semibold text-slate-900">学生提交与批改</h2>
          {records.map((target) => <form key={target.id} action={(formData) => grade(target, formData)} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><p className="font-medium">{target.userName}</p><p className="text-xs text-slate-500">{target.status} · {target.submittedAt ? new Date(target.submittedAt).toLocaleString("zh-CN") : "尚未提交"}</p></div><Badge tone={target.status === "GRADED" ? "green" : "orange"}>{target.score ?? 0} 分</Badge></div>{target.answers.map((answer) => { const question = questions.find((item) => item.id === answer.questionId); return <div key={answer.id} className="rounded-xl bg-white p-4"><p className="text-sm font-medium">{question?.stem}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">学生回答：{answer.response || "未作答"}</p><p className="mt-1 text-xs text-blue-700">标准答案：{question?.answer}</p><div className="mt-3 grid gap-2 md:grid-cols-[120px_1fr]"><Input name={`score-${answer.id}`} type="number" min={0} max={answer.maxPoints} step="0.5" defaultValue={answer.score ?? 0} /><Input name={`feedback-${answer.id}`} defaultValue={answer.feedback ?? ""} placeholder="单题评语" /></div></div>; })}<Textarea name="feedback" defaultValue={target.feedback ?? ""} placeholder="整体评语" /><div className="flex gap-2"><Button type="submit" disabled={busy}><CheckCircle2 className="h-4 w-4" />保存评分</Button>{kind === "assignment" && target.status !== "RETURNED" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => returnSubmission(target)}>退回重做</Button> : null}</div></form>)}
          {!records.length ? <p className="text-sm text-slate-500">暂无学生提交。</p> : null}
        </section>
      ) : kind === "exam" && !record ? (
        <Button type="button" disabled={busy} onClick={() => request(endpoint, { method: "POST" })}>开始考试</Button>
      ) : (
        <section className="space-y-4">
          {questions.map((question, index) => <article key={question.id} className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex justify-between gap-3"><h3 className="font-medium text-slate-900">{index + 1}. {question.stem}</h3><span className="text-sm text-slate-500">{question.points} 分</span></div><div className="mt-4">{question.type === "short_answer" ? <Textarea value={responses[question.id] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [question.id]: event.target.value }))} disabled={!editable} className="min-h-28" /> : question.options.map((option, optionIndex) => { const value = choiceKey(optionIndex); return <label key={`${value}-${option}`} className="mt-2 flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`question-${question.id}`} value={value} checked={question.type === "multiple_choice" ? (responses[question.id] ?? "").split(",").includes(value) : responses[question.id] === value} onChange={(event) => question.type === "multiple_choice" ? updateMultiple(question.id, value, event.target.checked) : setResponses((current) => ({ ...current, [question.id]: value }))} disabled={!editable} />{choiceLabel(option, optionIndex)}</label>; })}</div>{resultVisible ? <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800"><p>答案：{question.answer}</p>{question.explanation ? <p className="mt-1">解析：{question.explanation}</p> : null}</div> : null}</article>)}
          {record?.score !== null && resultVisible ? <p className="rounded-2xl bg-emerald-50 p-5 font-medium text-emerald-800">成绩：{record?.score} 分{record?.feedback ? ` · ${record.feedback}` : ""}</p> : null}
          {editable ? <div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => saveOrSubmit("SAVE")}><Save className="h-4 w-4" />暂存</Button><Button type="button" disabled={busy} onClick={() => saveOrSubmit("SUBMIT")}><Send className="h-4 w-4" />正式提交</Button></div> : record ? <p className="text-sm text-slate-500">当前状态：{record.status === "GRADED" ? "已评分" : "已提交"}</p> : null}
        </section>
      )}
      <Dialog open={Boolean(extensionTarget)} title={`设置 ${extensionTarget?.name ?? "学生"} 的截止时间`} onClose={() => !busy && setExtensionTarget(null)}><form key={extensionTarget?.id} action={extendStudent} className="space-y-4"><label className="block space-y-1 text-sm"><span>单独截止时间（留空清除延期）</span><Input name="dueAt" type="datetime-local" defaultValue={extensionTarget?.dueAt ? new Date(new Date(extensionTarget.dueAt).getTime() - new Date(extensionTarget.dueAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} /></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setExtensionTarget(null)}>取消</Button><Button type="submit" disabled={busy}>保存延期</Button></div></form></Dialog>
    </div>
  );
}
