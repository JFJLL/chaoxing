"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

type SourceQuestion = { id: string; type: string; stem: string };
type AssessmentItem = { id: string; title: string; status: string; questionCount: number; submissionCount: number; dueAt?: string | null; allowLate?: boolean; immediateFeedback?: boolean; startsAt?: string | null; endsAt?: string | null; durationMinutes?: number; resultPublishedAt?: string | null };
type ManualQuestion = { type: "single_choice" | "multiple_choice" | "short_answer"; stem: string; options: string; answer: string; explanation: string; points: number };

const emptyQuestion = (): ManualQuestion => ({ type: "single_choice", stem: "", options: "", answer: "", explanation: "", points: 10 });
const optionalIsoDate = (value: string) => {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("时间格式无效，请输入有效日期时间");
  return date.toISOString();
};

export function AssessmentListClient({ kind, courseId, canManage, sourceQuestions, items, paperSources = [] }: { kind: "assignment" | "exam"; courseId: string; canManage: boolean; sourceQuestions: SourceQuestion[]; items: AssessmentItem[]; paperSources?: Array<{ id: string; title: string }> }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([]);
  const plural = kind === "assignment" ? "assignments" : "exams"; const label = kind === "assignment" ? "作业" : "考试";
  async function request(url: string, init: RequestInit) { setBusy(true); setError(""); try { const response = await fetch(url, init); const body = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "操作失败"); router.refresh(); return true; } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); return false; } finally { setBusy(false); } }
  async function create(formData: FormData) {
    const sourceQuestionIds = formData.getAll("sourceQuestionIds").map(String);
    const questions = manualQuestions.filter((question) => question.stem.trim()).map((question) => ({ ...question, options: question.type === "short_answer" ? undefined : question.options.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }));
    const payload = kind === "assignment" ? { title: formData.get("title"), instructions: formData.get("instructions"), dueAt: formData.get("dueAt") ? new Date(String(formData.get("dueAt"))).toISOString() : null, allowLate: formData.get("allowLate") === "on", immediateFeedback: formData.get("immediateFeedback") === "on", sourceQuestionIds, questions } : { title: formData.get("title"), instructions: formData.get("instructions"), startsAt: formData.get("startsAt") ? new Date(String(formData.get("startsAt"))).toISOString() : null, endsAt: formData.get("endsAt") ? new Date(String(formData.get("endsAt"))).toISOString() : null, durationMinutes: Number(formData.get("durationMinutes")), sourceArtifactId: formData.get("sourceArtifactId") || null, sourceQuestionIds, questions };
    if (await request(`/api/courses/${courseId}/${plural}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })) setManualQuestions([]);
  }
  async function action(id: string, actionName: string) { await request(`/api/courses/${courseId}/${plural}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }); }
  async function adjustSchedule(item: AssessmentItem) {
    try {
      if (kind === "assignment") {
        const value = window.prompt("新的截止时间（ISO 时间；留空取消截止）", item.dueAt ?? "");
        if (value === null) return;
        await request(`/api/courses/${courseId}/${plural}/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SCHEDULE", dueAt: optionalIsoDate(value), allowLate: window.confirm("是否允许迟交？"), immediateFeedback: window.confirm("是否提交后立即反馈？") }) });
        return;
      }
      const starts = window.prompt("新的开始时间（ISO 时间；留空表示立即可用）", item.startsAt ?? ""); if (starts === null) return;
      const ends = window.prompt("新的结束时间（ISO 时间；留空表示不限场次截止）", item.endsAt ?? ""); if (ends === null) return;
      const duration = Number(window.prompt("答题时长（分钟）", String(item.durationMinutes ?? 60))); if (!Number.isInteger(duration) || duration < 1 || duration > 600) throw new Error("答题时长应为 1 到 600 分钟的整数");
      await request(`/api/courses/${courseId}/${plural}/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SCHEDULE", startsAt: optionalIsoDate(starts), endsAt: optionalIsoDate(ends), durationMinutes: duration }) });
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "时间设置无效");
    }
  }
  return <div className="space-y-5">
    {canManage ? <form action={create} className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><h2 className="font-semibold text-slate-900">新建{label}草稿</h2><div className="grid gap-3 md:grid-cols-2"><Input name="title" required placeholder={`${label}标题`} /><Textarea name="instructions" placeholder="任务说明" className="min-h-10" /></div>{kind === "assignment" ? <div className="grid gap-3 md:grid-cols-3"><label className="space-y-1 text-sm"><span>截止时间</span><Input name="dueAt" type="datetime-local" /></label><label className="flex items-center gap-2 text-sm"><input name="allowLate" type="checkbox" />允许迟交</label><label className="flex items-center gap-2 text-sm"><input name="immediateFeedback" type="checkbox" />提交后立即反馈</label></div> : <div className="grid gap-3 md:grid-cols-3"><label className="space-y-1 text-sm"><span>开始时间</span><Input name="startsAt" type="datetime-local" /></label><label className="space-y-1 text-sm"><span>结束时间</span><Input name="endsAt" type="datetime-local" /></label><label className="space-y-1 text-sm"><span>答题时长（分钟）</span><Input name="durationMinutes" type="number" min={1} max={600} defaultValue={60} /></label></div>}
      {kind === "exam" && paperSources.length ? <label className="block space-y-1 text-sm"><span>从 AI 组卷模板创建</span><select name="sourceArtifactId" className="h-10 w-full rounded-md border bg-white px-3"><option value="">不使用模板</option>{paperSources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label> : null}<section><h3 className="text-sm font-medium text-slate-800">从已确认题库选题</h3><div className="mt-2 max-h-48 space-y-2 overflow-auto rounded-xl bg-white p-3">{sourceQuestions.map((question) => <label key={question.id} className="flex gap-2 text-sm"><input name="sourceQuestionIds" value={question.id} type="checkbox" /><span>{question.stem}</span></label>)}{!sourceQuestions.length ? <p className="text-sm text-slate-500">题库暂无已确认题目，可在下方手工新增。</p> : null}</div></section>
      <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-medium text-slate-800">手工新增题目</h3><Button type="button" variant="secondary" className="h-8" onClick={() => setManualQuestions((current) => [...current, emptyQuestion()])}><Plus className="h-4 w-4" />新增题目</Button></div>{manualQuestions.map((question, index) => <div key={index} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-2"><select value={question.type} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as ManualQuestion["type"] } : item))} className="h-10 rounded-md border px-3"><option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="short_answer">简答题</option></select><Input type="number" min={1} value={question.points} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) } : item))} placeholder="分值" /><Textarea value={question.stem} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stem: event.target.value } : item))} placeholder="题干" />{question.type !== "short_answer" ? <Textarea value={question.options} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: event.target.value } : item))} placeholder="选项，每行一个" /> : null}<Input value={question.answer} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} placeholder="标准答案" /><Input value={question.explanation} onChange={(event) => setManualQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item))} placeholder="答案解析" /></div>)}</section><Button type="submit" disabled={busy}><ClipboardCheck className="h-4 w-4" />创建草稿</Button></form> : null}
    {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.questionCount} 道题{canManage ? ` · ${item.submissionCount} 份提交` : ""}</p><p className="mt-1 text-xs text-slate-400">{kind === "assignment" ? item.dueAt ? `截止 ${new Date(item.dueAt).toLocaleString("zh-CN")}` : "不限截止时间" : `${item.startsAt ? new Date(item.startsAt).toLocaleString("zh-CN") : "立即可用"} · ${item.durationMinutes ?? 60} 分钟`}</p></div><Badge tone={item.status === "PUBLISHED" ? "green" : item.status === "DRAFT" ? "orange" : "gray"}>{item.status === "PUBLISHED" ? "已发布" : item.status === "DRAFT" ? "草稿" : "已撤回"}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/space/courses/${courseId}/${plural}/${item.id}`} className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm text-slate-700">{canManage ? "查看与批改" : kind === "assignment" ? "进入作业" : "进入考试"}</Link>{canManage ? <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={() => adjustSchedule(item)}>调整时间</Button> : null}{canManage && item.status === "DRAFT" ? <Button type="button" className="h-9" disabled={busy} onClick={() => action(item.id, "PUBLISH")}><Send className="h-4 w-4" />发布</Button> : null}{canManage && item.status === "PUBLISHED" ? <><Button type="button" variant="danger" className="h-9" disabled={busy} onClick={() => action(item.id, "WITHDRAW")}>撤回</Button>{!item.resultPublishedAt ? <Button type="button" variant="secondary" className="h-9" onClick={() => action(item.id, "PUBLISH_RESULTS")}>发布成绩</Button> : null}</> : null}</div></article>)}{!items.length ? <p className="text-sm text-slate-500">暂无{label}。</p> : null}</div>
  </div>;
}
