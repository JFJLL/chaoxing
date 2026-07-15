"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

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

function choiceValue(option: string) {
  return option.match(/^\s*([A-L])(?:[.、:：)）]|\s)/i)?.[1]?.toUpperCase() ?? option;
}

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
  const [draftQuestions, setDraftQuestions] = useState(() => questions.map((question) => ({ ...question, answer: question.answer ?? "", explanation: question.explanation ?? "" })));
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  const [remaining, setRemaining] = useState<number | null>(deadline ? Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)) : null);
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
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setMessage("操作成功");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
      return false;
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
    if (!deadline || canManage || record?.status !== "IN_PROGRESS") return;
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
          stem: question.stem,
          options: question.type === "short_answer" ? undefined : question.options,
          answer: question.answer,
          explanation: question.explanation,
          points: question.points
        }))
      })
    });
  }

  async function extendStudent(student: ExtensionStudent) {
    const value = window.prompt(`为 ${student.name} 设置单独截止时间（ISO 时间；留空清除）`, student.dueAt ?? "");
    if (value === null) return;
    let dueAt: string | null = null;
    if (value.trim()) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) { setError("截止时间格式无效"); return; }
      dueAt = date.toISOString();
    }
    await request(`/api/courses/${courseId}/assignments/${itemId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "EXTEND", userId: student.id, dueAt }) });
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
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold text-slate-900">{title}</h2>{instructions ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{instructions}</p> : null}</div>
          {remaining !== null ? <Badge tone={remaining > 300 ? "blue" : "orange"}><Clock3 className="mr-1 inline h-3.5 w-3.5" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Badge> : null}
        </div>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}

      {canManage && status === "DRAFT" ? (
        <section className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
          <h2 className="font-semibold text-slate-900">编辑发布前内容</h2>
          <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="标题" />
          <Textarea value={draftInstructions} onChange={(event) => setDraftInstructions(event.target.value)} placeholder="说明" />
          {draftQuestions.map((question, index) => (
            <div key={question.id} className="grid gap-2 rounded-xl bg-white p-4 md:grid-cols-2">
              <select value={question.type} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} className="h-10 rounded-md border px-3"><option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="short_answer">简答题</option></select>
              <Input type="number" min={1} value={question.points} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) } : item))} />
              <Textarea value={question.stem} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stem: event.target.value } : item))} placeholder="题干" />
              {question.type !== "short_answer" ? <Textarea value={question.options.join("\n")} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) } : item))} placeholder="选项，每行一个" /> : <div />}
              <Input value={question.answer} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} placeholder="标准答案" />
              <Input value={question.explanation} onChange={(event) => setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item))} placeholder="解析" />
              <Button type="button" variant="danger" className="h-8" disabled={draftQuestions.length === 1} onClick={() => setDraftQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" />删除题目</Button>
            </div>
          ))}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setDraftQuestions((current) => [...current, { id: `new-${Date.now()}`, type: "short_answer", stem: "", options: [], points: 10, answer: "", explanation: "" }])}><Plus className="h-4 w-4" />新增题目</Button><Button type="button" disabled={busy || !draftTitle.trim()} onClick={saveDraft}><Save className="h-4 w-4" />保存修改</Button></div>
        </section>
      ) : canManage ? (
        <section className="space-y-4">
          {kind === "assignment" && extensionStudents.length ? <div className="rounded-2xl border border-slate-100 bg-white p-4"><h2 className="font-semibold text-slate-900">个别学生延期</h2><div className="mt-3 flex flex-wrap gap-2">{extensionStudents.map((student) => <Button key={student.id} type="button" variant="secondary" className="h-8" onClick={() => extendStudent(student)}>{student.name}{student.dueAt ? ` · ${new Date(student.dueAt).toLocaleString("zh-CN")}` : ""}</Button>)}</div></div> : null}
          <h2 className="font-semibold text-slate-900">学生提交与批改</h2>
          {records.map((target) => <form key={target.id} action={(formData) => grade(target, formData)} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><p className="font-medium">{target.userName}</p><p className="text-xs text-slate-500">{target.status} · {target.submittedAt ? new Date(target.submittedAt).toLocaleString("zh-CN") : "尚未提交"}</p></div><Badge tone={target.status === "GRADED" ? "green" : "orange"}>{target.score ?? 0} 分</Badge></div>{target.answers.map((answer) => { const question = questions.find((item) => item.id === answer.questionId); return <div key={answer.id} className="rounded-xl bg-white p-4"><p className="text-sm font-medium">{question?.stem}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">学生回答：{answer.response || "未作答"}</p><p className="mt-1 text-xs text-blue-700">标准答案：{question?.answer}</p><div className="mt-3 grid gap-2 md:grid-cols-[120px_1fr]"><Input name={`score-${answer.id}`} type="number" min={0} max={answer.maxPoints} step="0.5" defaultValue={answer.score ?? 0} /><Input name={`feedback-${answer.id}`} defaultValue={answer.feedback ?? ""} placeholder="单题评语" /></div></div>; })}<Textarea name="feedback" defaultValue={target.feedback ?? ""} placeholder="整体评语" /><div className="flex gap-2"><Button type="submit" disabled={busy}><CheckCircle2 className="h-4 w-4" />保存评分</Button>{kind === "assignment" && target.status !== "RETURNED" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => returnSubmission(target)}>退回重做</Button> : null}</div></form>)}
          {!records.length ? <p className="text-sm text-slate-500">暂无学生提交。</p> : null}
        </section>
      ) : kind === "exam" && !record ? (
        <Button type="button" disabled={busy} onClick={() => request(endpoint, { method: "POST" })}>开始考试</Button>
      ) : (
        <section className="space-y-4">
          {questions.map((question, index) => <article key={question.id} className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex justify-between gap-3"><h3 className="font-medium text-slate-900">{index + 1}. {question.stem}</h3><span className="text-sm text-slate-500">{question.points} 分</span></div><div className="mt-4">{question.type === "short_answer" ? <Textarea value={responses[question.id] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [question.id]: event.target.value }))} disabled={!editable} className="min-h-28" /> : question.options.map((option) => { const value = choiceValue(option); return <label key={option} className="mt-2 flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`question-${question.id}`} checked={question.type === "multiple_choice" ? (responses[question.id] ?? "").split(",").includes(value) : responses[question.id] === value} onChange={(event) => question.type === "multiple_choice" ? updateMultiple(question.id, value, event.target.checked) : setResponses((current) => ({ ...current, [question.id]: value }))} disabled={!editable} />{option}</label>; })}</div>{resultVisible ? <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800"><p>答案：{question.answer}</p>{question.explanation ? <p className="mt-1">解析：{question.explanation}</p> : null}</div> : null}</article>)}
          {record?.score !== null && resultVisible ? <p className="rounded-2xl bg-emerald-50 p-5 font-medium text-emerald-800">成绩：{record?.score} 分{record?.feedback ? ` · ${record.feedback}` : ""}</p> : null}
          {editable ? <div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => saveOrSubmit("SAVE")}><Save className="h-4 w-4" />暂存</Button><Button type="button" disabled={busy} onClick={() => saveOrSubmit("SUBMIT")}><Send className="h-4 w-4" />正式提交</Button></div> : record ? <p className="text-sm text-slate-500">当前状态：{record.status === "GRADED" ? "已评分" : "已提交"}</p> : null}
        </section>
      )}
    </div>
  );
}
