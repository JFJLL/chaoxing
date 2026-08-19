"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export type EditableAssessmentQuestion = {
  id: string;
  sourceQuestionId?: string | null;
  type: "single_choice" | "multiple_choice" | "short_answer";
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  points: number;
};

export function createEmptyQuestion(id = "manual-1"): EditableAssessmentQuestion {
  return { id, type: "single_choice", stem: "", options: ["", ""], answer: "", explanation: "", points: 10 };
}

function summary(question: EditableAssessmentQuestion, index: number) {
  return question.stem.trim() || `第 ${index + 1} 题（未填写）`;
}

export function AssessmentQuestionEditor({
  questions,
  onChange,
  title = "手工题目"
}: {
  questions: EditableAssessmentQuestion[];
  onChange: (questions: EditableAssessmentQuestion[]) => void;
  title?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const nextId = useRef(questions.length + 1);

  useEffect(() => {
    if (activeIndex >= questions.length) setActiveIndex(Math.max(0, questions.length - 1));
  }, [activeIndex, questions.length]);

  const active = questions[activeIndex];
  function update(patch: Partial<EditableAssessmentQuestion>) {
    onChange(questions.map((question, index) => index === activeIndex ? { ...question, ...patch } : question));
  }
  function addQuestion() {
    const next = [...questions, createEmptyQuestion(`manual-${nextId.current++}`)];
    onChange(next);
    setActiveIndex(next.length - 1);
  }
  function duplicateQuestion() {
    if (!active) return;
    const duplicate = { ...active, id: `manual-${nextId.current++}`, sourceQuestionId: null };
    const next = [...questions.slice(0, activeIndex + 1), duplicate, ...questions.slice(activeIndex + 1)];
    onChange(next);
    setActiveIndex(activeIndex + 1);
  }
  function removeQuestion() {
    if (questions.length === 1) return;
    onChange(questions.filter((_, index) => index !== activeIndex));
    setActiveIndex(Math.max(0, activeIndex - 1));
  }
  function move(direction: -1 | 1) {
    const destination = activeIndex + direction;
    if (destination < 0 || destination >= questions.length) return;
    const next = [...questions];
    [next[activeIndex], next[destination]] = [next[destination], next[activeIndex]];
    onChange(next);
    setActiveIndex(destination);
  }

  if (!active) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">左侧切换题目，右侧专注编辑当前题。</p></div>
        <Button type="button" variant="secondary" onClick={addQuestion}><Plus className="h-4 w-4" />添加下一题</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="px-2 text-xs font-medium text-slate-500">共 {questions.length} 题</p>
          <div className="mt-2 max-h-[520px] space-y-2 overflow-auto">
            {questions.map((question, index) => (
              <button key={question.id} type="button" onClick={() => setActiveIndex(index)} className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${index === activeIndex ? "border-[#E5A597] bg-white text-[#6F281D] shadow-sm" : "border-transparent text-slate-600 hover:bg-white"}`}>
                <span className="block text-xs text-slate-400">第 {index + 1} 题 · {question.points} 分</span>
                <span className="mt-1 block truncate font-medium">{summary(question, index)}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <h3 className="font-semibold text-slate-900">第 {activeIndex + 1} 题</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" className="h-8 px-2" disabled={activeIndex === 0} onClick={() => move(-1)} aria-label="上移当前题"><ArrowUp className="h-4 w-4" />上移</Button>
              <Button type="button" variant="ghost" className="h-8 px-2" disabled={activeIndex === questions.length - 1} onClick={() => move(1)} aria-label="下移当前题"><ArrowDown className="h-4 w-4" />下移</Button>
              <Button type="button" variant="ghost" className="h-8 px-2" onClick={duplicateQuestion}><Copy className="h-4 w-4" />复制</Button>
              <Button type="button" variant="danger" className="h-8 px-2" disabled={questions.length === 1} onClick={removeQuestion}><Trash2 className="h-4 w-4" />删除</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">题型</span><select value={active.type} onChange={(event) => update({ type: event.target.value as EditableAssessmentQuestion["type"], options: event.target.value === "short_answer" ? [] : active.options.length >= 2 ? active.options : ["", ""] })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="short_answer">简答题</option></select></label>
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">分值</span><Input type="number" min={1} max={1000} value={active.points} onChange={(event) => update({ points: Number(event.target.value) })} /></label>
          </div>
          <label className="mt-4 block space-y-1.5 text-sm"><span className="font-medium text-slate-700">题干</span><Textarea value={active.stem} onChange={(event) => update({ stem: event.target.value })} className="min-h-28" placeholder="输入题目内容" /></label>
          {active.type !== "short_answer" ? <div className="mt-4 space-y-1.5 text-sm"><label className="block space-y-1.5"><span className="font-medium text-slate-700">选项</span><Textarea value={active.options.join("\n")} onChange={(event) => update({ options: event.target.value.split(/\r?\n/) })} className="min-h-32" placeholder="每行一个选项，系统自动标记 A、B、C…" /></label><p className="text-xs text-slate-400">标准答案可填写字母，也可直接填写选项文字。</p></div> : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">标准答案</span><Input value={active.answer} onChange={(event) => update({ answer: event.target.value })} placeholder={active.type === "multiple_choice" ? "例如 A,C" : active.type === "single_choice" ? "例如 A" : "输入参考答案"} /></label>
            <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">答案解析</span><Input value={active.explanation} onChange={(event) => update({ explanation: event.target.value })} placeholder="说明解题思路" /></label>
          </div>
        </div>
      </div>
    </section>
  );
}
