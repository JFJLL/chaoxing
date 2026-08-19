"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Save, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Input";
import { choiceLabel } from "@/lib/teaching/choiceQuestions";

export type QuestionBankItem = {
  id: string;
  type: "single_choice" | "multiple_choice" | "short_answer";
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  version: number;
  sourceTitle: string;
  sourceVersion: number | null;
};

function typeLabel(type: QuestionBankItem["type"]) {
  return type === "single_choice" ? "单选题" : type === "multiple_choice" ? "多选题" : "简答题";
}

export function QuestionBankClient({ courseId, initialQuestions }: { courseId: string; initialQuestions: QuestionBankItem[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initialQuestions);
  const [selected, setSelected] = useState<QuestionBankItem | null>(null);
  const [draft, setDraft] = useState<QuestionBankItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open(question: QuestionBankItem) {
    setSelected(question); setDraft(structuredClone(question)); setError("");
  }
  function close() {
    if (!busy) { setSelected(null); setDraft(null); setError(""); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/question-bank/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: draft.type, stem: draft.stem, options: draft.type === "short_answer" ? undefined : draft.options.map((option) => option.trim()).filter(Boolean), answer: draft.answer, explanation: draft.explanation, expectedVersion: selected.version })
      });
      const body = await response.json().catch(() => null) as { error?: string; question?: QuestionBankItem } | null;
      if (!response.ok || !body?.question) throw new Error(body?.error ?? "保存题目失败");
      setQuestions((current) => current.map((question) => question.id === body.question!.id ? body.question! : question));
      setSelected(body.question); setDraft(structuredClone(body.question));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存题目失败");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="space-y-3">
      {questions.map((question) => <button key={question.id} type="button" onClick={() => open(question)} className="group w-full rounded-2xl border border-slate-100 bg-slate-50 p-5 text-left transition hover:border-[#F0C8BE] hover:bg-[#FDF3F0]/40 focus:outline-none focus:ring-2 focus:ring-[#F0C8BE]">
        <div className="flex items-start justify-between gap-4"><div><ScrollText className="h-6 w-6 text-emerald-600" /><p className="mt-3 text-xs font-medium text-slate-400">{typeLabel(question.type)} · v{question.version}</p><h2 className="mt-1 font-semibold text-slate-900">{question.stem}</h2><p className="mt-2 text-sm text-[#8E3425]">答案：{question.answer}</p><p className="mt-1 text-xs text-slate-400">{question.sourceTitle} · 来源产物 v{question.sourceVersion ?? "-"} · {question.id}</p></div><span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 group-hover:border-[#F0C8BE] group-hover:text-[#8E3425]"><Eye className="h-4 w-4" />查看与编辑</span></div>
      </button>)}
      {!questions.length ? <p className="text-sm text-slate-500">暂无题目，可使用 AI出题 生成。</p> : null}
    </div>
    <Dialog open={Boolean(selected && draft)} title="查看与编辑题目" onClose={close} panelClassName="max-w-3xl">
      {draft ? <form onSubmit={save} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><span>题目 ID：{draft.id}</span><span>当前版本：v{draft.version}</span></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">题型</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as QuestionBankItem["type"], options: event.target.value === "short_answer" ? [] : draft.options.length >= 2 ? draft.options : ["", ""] })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="short_answer">简答题</option></select></label>
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">标准答案</span><Input value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} placeholder={draft.type === "multiple_choice" ? "例如 A,C" : draft.type === "single_choice" ? "例如 A" : "输入参考答案"} /></label>
        </div>
        <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">题干</span><Textarea value={draft.stem} onChange={(event) => setDraft({ ...draft, stem: event.target.value })} className="min-h-28" /></label>
        {draft.type !== "short_answer" ? <div className="space-y-1.5 text-sm"><label className="block space-y-1.5"><span className="font-medium text-slate-700">选项</span><Textarea value={draft.options.join("\n")} onChange={(event) => setDraft({ ...draft, options: event.target.value.split(/\r?\n/) })} className="min-h-32" /></label><p className="text-xs text-slate-400">{draft.options.filter(Boolean).map((option, index) => choiceLabel(option, index)).join("；")}</p></div> : null}
        <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">答案解析</span><Textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} className="min-h-24" /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>关闭</Button><Button type="submit" disabled={busy || !draft.stem.trim()}><Save className="h-4 w-4" />{busy ? "保存中…" : "保存为新版本"}</Button></div>
      </form> : null}
    </Dialog>
  </>;
}
