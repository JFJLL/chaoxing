"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

type AssessmentItem = {
  id: string;
  title: string;
  status: string;
  questionCount: number;
  submissionCount: number;
  dueAt?: string | null;
  allowLate?: boolean;
  immediateFeedback?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  durationMinutes?: number;
  resultPublishedAt?: string | null;
};

function optionalIsoDate(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("时间格式无效，请输入有效日期时间");
  return date.toISOString();
}

const toLocalDateTime = (value?: string | null) => value
  ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  : "";

export function AssessmentListClient({
  kind,
  courseId,
  canManage,
  items
}: {
  kind: "assignment" | "exam";
  courseId: string;
  canManage: boolean;
  items: AssessmentItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scheduleItem, setScheduleItem] = useState<AssessmentItem | null>(null);
  const plural = kind === "assignment" ? "assignments" : "exams";
  const label = kind === "assignment" ? "作业" : "考试";

  async function request(url: string, init: RequestInit) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, actionName: string) {
    await request(`/api/courses/${courseId}/${plural}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) });
  }

  async function saveSchedule(formData: FormData) {
    if (!scheduleItem) return;
    try {
      const durationMinutes = Number(formData.get("durationMinutes"));
      if (kind === "exam" && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600)) throw new Error("答题时长应为 1 到 600 分钟的整数");
      const body = kind === "assignment"
        ? { action: "SCHEDULE", dueAt: optionalIsoDate(String(formData.get("dueAt") || "")), allowLate: formData.get("allowLate") === "on", immediateFeedback: formData.get("immediateFeedback") === "on" }
        : { action: "SCHEDULE", startsAt: optionalIsoDate(String(formData.get("startsAt") || "")), endsAt: optionalIsoDate(String(formData.get("endsAt") || "")), durationMinutes };
      if (await request(`/api/courses/${courseId}/${plural}/${scheduleItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })) setScheduleItem(null);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "时间设置无效");
    }
  }

  return <div className="space-y-5">
    {canManage ? <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{label}列表</h2><p className="mt-1 text-sm text-slate-500">先查看和管理已有{label}，需要时再新建。</p></div><LinkButton href={`/space/courses/${courseId}/${plural}/new`}><Plus className="h-4 w-4" />新建{label}</LinkButton></div> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    <div className="space-y-3">
      {items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.questionCount} 道题{canManage ? ` · ${item.submissionCount} 份提交` : ""}</p><p className="mt-1 text-xs text-slate-400">{kind === "assignment" ? item.dueAt ? `截止 ${new Date(item.dueAt).toLocaleString("zh-CN")}` : "不限截止时间" : `${item.startsAt ? new Date(item.startsAt).toLocaleString("zh-CN") : "立即可用"} · ${item.durationMinutes ?? 60} 分钟`}</p></div><Badge tone={item.status === "PUBLISHED" ? "green" : item.status === "DRAFT" ? "orange" : "gray"}>{item.status === "PUBLISHED" ? "已发布" : item.status === "DRAFT" ? "草稿" : "已撤回"}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/space/courses/${courseId}/${plural}/${item.id}`} className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm text-slate-700">{canManage ? "查看与批改" : kind === "assignment" ? "进入作业" : "进入考试"}</Link>{canManage ? <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={() => setScheduleItem(item)}>调整时间</Button> : null}{canManage && item.status === "DRAFT" ? <Button type="button" className="h-9" disabled={busy} onClick={() => action(item.id, "PUBLISH")}><Send className="h-4 w-4" />发布</Button> : null}{canManage && item.status === "PUBLISHED" ? <><Button type="button" variant="danger" className="h-9" disabled={busy} onClick={() => action(item.id, "WITHDRAW")}>撤回</Button>{!item.resultPublishedAt ? <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={() => action(item.id, "PUBLISH_RESULTS")}>发布成绩</Button> : null}</> : null}</div></article>)}
      {!items.length ? <p className="text-sm text-slate-500">暂无{label}。</p> : null}
    </div>
    <Dialog open={Boolean(scheduleItem)} title={`调整${label}时间`} onClose={() => !busy && setScheduleItem(null)}>
      <form key={scheduleItem?.id} action={saveSchedule} className="space-y-4">
        {kind === "assignment" ? <><label className="block space-y-1.5 text-sm"><span>截止时间</span><Input name="dueAt" type="datetime-local" defaultValue={toLocalDateTime(scheduleItem?.dueAt)} /></label><label className="flex items-center gap-2 text-sm"><input name="allowLate" type="checkbox" defaultChecked={scheduleItem?.allowLate} />允许迟交</label><label className="flex items-center gap-2 text-sm"><input name="immediateFeedback" type="checkbox" defaultChecked={scheduleItem?.immediateFeedback} />提交后立即反馈</label></> : <><label className="block space-y-1.5 text-sm"><span>开始时间</span><Input name="startsAt" type="datetime-local" defaultValue={toLocalDateTime(scheduleItem?.startsAt)} /></label><label className="block space-y-1.5 text-sm"><span>结束时间</span><Input name="endsAt" type="datetime-local" defaultValue={toLocalDateTime(scheduleItem?.endsAt)} /></label><label className="block space-y-1.5 text-sm"><span>答题时长（分钟）</span><Input name="durationMinutes" type="number" min={1} max={600} defaultValue={scheduleItem?.durationMinutes ?? 60} /></label></>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setScheduleItem(null)}>取消</Button><Button type="submit" disabled={busy}>保存设置</Button></div>
      </form>
    </Dialog>
  </div>;
}
