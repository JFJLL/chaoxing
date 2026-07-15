"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { AssessmentQuestionEditor, createEmptyQuestion, type EditableAssessmentQuestion } from "@/components/course-workspace/AssessmentQuestionEditor";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

type SourceQuestion = { id: string; type: string; stem: string };

function optionalIsoDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("时间格式无效，请重新选择");
  return date.toISOString();
}

export function AssessmentCreateClient({
  kind,
  courseId,
  sourceQuestions,
  paperSources = []
}: {
  kind: "assignment" | "exam";
  courseId: string;
  sourceQuestions: SourceQuestion[];
  paperSources?: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<EditableAssessmentQuestion[]>([createEmptyQuestion()]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "assignment" ? "作业" : "考试";
  const plural = kind === "assignment" ? "assignments" : "exams";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const formData = new FormData(event.currentTarget);
      const manualQuestions = questions.filter((question) => question.stem.trim()).map((question) => ({
        type: question.type,
        stem: question.stem.trim(),
        options: question.type === "short_answer" ? undefined : question.options.map((option) => option.trim()).filter(Boolean),
        answer: question.answer.trim(),
        explanation: question.explanation.trim(),
        points: question.points
      }));
      manualQuestions.forEach((question, index) => {
        if (!question.answer) throw new Error(`手工题目第 ${index + 1} 题缺少标准答案`);
        if (question.type !== "short_answer" && (!question.options || question.options.length < 2)) throw new Error(`手工题目第 ${index + 1} 题至少需要两个选项`);
        if (!Number.isFinite(question.points) || question.points <= 0) throw new Error(`手工题目第 ${index + 1} 题分值无效`);
      });
      if (!selectedSourceIds.length && !manualQuestions.length) throw new Error(`${label}至少需要一道题`);
      const base = {
        title: String(formData.get("title") ?? ""),
        instructions: String(formData.get("instructions") ?? ""),
        sourceQuestionIds: selectedSourceIds,
        questions: manualQuestions
      };
      const payload = kind === "assignment"
        ? { ...base, dueAt: optionalIsoDate(formData.get("dueAt")), allowLate: formData.get("allowLate") === "on", immediateFeedback: formData.get("immediateFeedback") === "on" }
        : { ...base, startsAt: optionalIsoDate(formData.get("startsAt")), endsAt: optionalIsoDate(formData.get("endsAt")), durationMinutes: Number(formData.get("durationMinutes")), sourceArtifactId: formData.get("sourceArtifactId") || null };
      const response = await fetch(`/api/courses/${courseId}/${plural}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? `创建${label}失败`);
      router.push(`/space/courses/${courseId}/${plural}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `创建${label}失败`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <h2 className="font-semibold text-slate-900">基本信息</h2>
        <div className="mt-4 grid gap-4">
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">{label}标题</span><Input name="title" required placeholder={`输入${label}标题`} autoFocus /></label>
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">说明</span><Textarea name="instructions" className="min-h-24" placeholder={`输入${label}要求、范围或注意事项`} /></label>
          {kind === "assignment" ? <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">截止时间</span><Input name="dueAt" type="datetime-local" /></label><div className="flex flex-col justify-end gap-3 pb-2 text-sm"><label className="flex items-center gap-2"><input name="allowLate" type="checkbox" />允许迟交</label><label className="flex items-center gap-2"><input name="immediateFeedback" type="checkbox" />提交后立即反馈</label></div></div> : <div className="grid gap-4 sm:grid-cols-3"><label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">开始时间</span><Input name="startsAt" type="datetime-local" /></label><label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">结束时间</span><Input name="endsAt" type="datetime-local" /></label><label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">答题时长（分钟）</span><Input name="durationMinutes" type="number" min={1} max={600} defaultValue={60} /></label></div>}
          {kind === "exam" && paperSources.length ? <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">AI 组卷模板</span><select name="sourceArtifactId" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="">不使用模板</option>{paperSources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold text-slate-900">从题库选题</h2><p className="mt-1 text-sm text-slate-500">已选择 {selectedSourceIds.length} 道，创建后可在草稿中继续调整。</p></div></div>
        <div className="mt-4 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
          {sourceQuestions.map((question) => <label key={question.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition ${selectedSourceIds.includes(question.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}><input type="checkbox" checked={selectedSourceIds.includes(question.id)} onChange={(event) => setSelectedSourceIds((current) => event.target.checked ? [...current, question.id] : current.filter((id) => id !== question.id))} /><span><span className="block text-xs text-slate-400">{question.type === "single_choice" ? "单选题" : question.type === "multiple_choice" ? "多选题" : "简答题"}</span><span className="mt-1 block font-medium text-slate-700">{question.stem}</span></span></label>)}
          {!sourceQuestions.length ? <p className="text-sm text-slate-500">题库暂无已确认题目，可直接在下方手工出题。</p> : null}
        </div>
      </section>

      <AssessmentQuestionEditor questions={questions} onChange={setQuestions} />
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-slate-500">共 {selectedSourceIds.length + questions.filter((question) => question.stem.trim()).length} 道有效题目</p>
        <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => router.push(`/space/courses/${courseId}/${plural}`)}>取消</Button><Button type="submit" disabled={busy}><ClipboardCheck className="h-4 w-4" />{busy ? "创建中…" : "创建草稿"}</Button></div>
      </div>
    </form>
  );
}
