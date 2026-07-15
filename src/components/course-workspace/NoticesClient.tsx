"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Clock3, Eye, Megaphone, Pencil, Pin, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

type NoticeDto = { id: string; title: string; body: string; status: string; publishAt: string | null; pinned: boolean; authorName: string; readAt: string | null; readCount: number; readerIds: string[] };
type NoticeTab = "PUBLISHED" | "SCHEDULED" | "DRAFT" | "WITHDRAWN";
const tabs: Array<{ id: NoticeTab; label: string }> = [{ id: "PUBLISHED", label: "已发布" }, { id: "SCHEDULED", label: "定时发布" }, { id: "DRAFT", label: "草稿" }, { id: "WITHDRAWN", label: "已撤回" }];

function effectiveStatus(notice: NoticeDto): NoticeTab {
  if (notice.status === "PUBLISHED" && notice.publishAt && new Date(notice.publishAt) > new Date()) return "SCHEDULED";
  if (notice.status === "PUBLISHED") return "PUBLISHED";
  if (notice.status === "WITHDRAWN") return "WITHDRAWN";
  return "DRAFT";
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value); const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function NoticesClient({ courseId, canManage, notices, students }: { courseId: string; canManage: boolean; notices: NoticeDto[]; students: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [noticeItems, setNoticeItems] = useState(notices);
  const [activeTab, setActiveTab] = useState<NoticeTab>("PUBLISHED");
  const [editor, setEditor] = useState<NoticeDto | "new" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<NoticeDto | null>(null);

  useEffect(() => {
    setNoticeItems(notices);
  }, [notices]);

  const visible = useMemo(() => canManage ? noticeItems.filter((notice) => effectiveStatus(notice) === activeTab) : noticeItems, [activeTab, canManage, noticeItems]);

  async function request(url: string, init: RequestInit, successText: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string; notice?: NoticeDto; read?: { readAt: string } } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setSuccess(successText); router.refresh(); return body ?? {};
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "操作失败"); return null; }
    finally { setBusy(false); }
  }

  async function save(formData: FormData) {
    const publishAtValue = String(formData.get("publishAt") || "");
    const intent = String(formData.get("intent") || "DRAFT");
    const payload = { title: formData.get("title"), body: formData.get("body"), pinned: formData.get("pinned") === "on", status: intent, publishAt: publishAtValue ? new Date(publishAtValue).toISOString() : null };
    const editing = editor !== "new" && editor;
    const result = await request(editing ? `/api/courses/${courseId}/notices/${editing.id}` : `/api/courses/${courseId}/notices`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, intent === "DRAFT" ? "草稿已保存" : publishAtValue && new Date(publishAtValue) > new Date() ? "通知已设置定时发布" : "通知已发布");
    if (result?.notice) {
      setNoticeItems((current) => editing ? current.map((notice) => notice.id === result.notice!.id ? result.notice! : notice) : [result.notice!, ...current]);
      setEditor(null); setActiveTab(intent === "DRAFT" ? "DRAFT" : publishAtValue && new Date(publishAtValue) > new Date() ? "SCHEDULED" : "PUBLISHED");
    }
  }

  async function toggleExpanded(notice: NoticeDto) {
    const opening = expandedId !== notice.id; setExpandedId(opening ? notice.id : null);
    if (opening && !canManage && !notice.readAt) {
      const result = await request(`/api/courses/${courseId}/notices/${notice.id}/read`, { method: "POST" }, "已记录阅读");
      if (result?.read) setNoticeItems((current) => current.map((item) => item.id === notice.id ? { ...item, readAt: result.read!.readAt } : item));
    }
  }

  const currentEditor = editor === "new" ? null : editor;
  return <div className="space-y-5">
    {canManage ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex w-fit rounded-full bg-slate-100 p-1">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-full px-4 py-2 text-sm transition ${activeTab === tab.id ? "bg-white font-medium text-blue-700 shadow-sm" : "text-slate-500"}`}>{tab.label}<span className="ml-1 text-xs">{noticeItems.filter((notice) => effectiveStatus(notice) === tab.id).length}</span></button>)}</div><Button type="button" onClick={() => setEditor("new")}><Plus className="h-4 w-4" />发布通知</Button></div> : null}
    {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}{success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
    <div className="space-y-3">{visible.map((notice) => { const status = effectiveStatus(notice); const expanded = expandedId === notice.id; const unread = students.filter((student) => !notice.readerIds.includes(student.id)); return <article key={notice.id} className="rounded-2xl border border-slate-100 bg-white p-5 transition hover:border-blue-100"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Megaphone className="h-5 w-5 text-orange-500" />{notice.pinned ? <Pin className="h-4 w-4 text-orange-500" /> : null}{canManage ? <Badge tone={status === "PUBLISHED" ? "green" : status === "DRAFT" ? "orange" : "gray"}>{tabs.find((tab) => tab.id === status)?.label}</Badge> : !notice.readAt ? <Badge tone="orange">未读</Badge> : <Badge tone="green">已读</Badge>}</div><h2 className="mt-3 font-semibold text-slate-900">{notice.title}</h2><p className={`mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-2"}`}>{notice.body}</p><p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{notice.authorName}</span>{notice.publishAt ? <><Clock3 className="h-3.5 w-3.5" /><span>{status === "SCHEDULED" ? "计划发布" : "发布于"} {new Date(notice.publishAt).toLocaleString("zh-CN")}</span></> : null}</p></div><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" className="h-8" onClick={() => toggleExpanded(notice)}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{expanded ? "收起" : "查看内容"}</Button>{canManage && status !== "WITHDRAWN" ? <><Button type="button" variant="secondary" className="h-8" onClick={() => setEditor(notice)}><Pencil className="h-4 w-4" />编辑</Button><Button type="button" variant="danger" className="h-8" onClick={() => setWithdrawTarget(notice)}><Trash2 className="h-4 w-4" />撤回</Button></> : null}</div></div>{canManage && expanded ? <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[180px_1fr]"><div><p className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4 text-blue-600" />已读 {notice.readCount} / {students.length}</p><p className="mt-1 text-xs text-slate-500">阅读率 {students.length ? Math.round(notice.readCount / students.length * 100) : 0}%</p></div><div><p className="flex items-center gap-2 text-sm font-medium"><UsersRound className="h-4 w-4 text-orange-500" />未读学生</p><p className="mt-1 text-sm text-slate-500">{unread.length ? unread.map((student) => student.name).join("、") : "全部学生已读"}</p></div></div> : null}</article>; })}{!visible.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">{canManage ? `暂无${tabs.find((tab) => tab.id === activeTab)?.label}通知。` : "当前暂无通知。"}</p> : null}</div>
    <Dialog open={Boolean(editor)} title={currentEditor ? "编辑通知" : "发布通知"} onClose={() => !busy && setEditor(null)}><form key={currentEditor?.id ?? "new"} action={save} className="space-y-4"><label className="block space-y-1 text-sm"><span>通知标题</span><Input name="title" required maxLength={200} defaultValue={currentEditor?.title ?? ""} /></label><label className="block space-y-1 text-sm"><span>通知内容</span><Textarea name="body" required maxLength={10_000} defaultValue={currentEditor?.body ?? ""} className="min-h-40" /></label><label className="block space-y-1 text-sm"><span>定时发布（留空则立即发布）</span><Input name="publishAt" type="datetime-local" defaultValue={toLocalDateTime(currentEditor?.publishAt ?? null)} /></label><label className="flex items-center gap-2 text-sm"><input name="pinned" type="checkbox" defaultChecked={currentEditor?.pinned ?? false} />置顶通知</label><div className="flex justify-end gap-2"><Button name="intent" value="DRAFT" type="submit" variant="secondary" disabled={busy}>保存草稿</Button><Button name="intent" value="PUBLISHED" type="submit" disabled={busy}><Send className="h-4 w-4" />发布通知</Button></div></form></Dialog>
    <Dialog open={Boolean(withdrawTarget)} title="撤回通知" onClose={() => !busy && setWithdrawTarget(null)}><p className="text-sm leading-6 text-slate-600">撤回“{withdrawTarget?.title}”后，学生端将立即停止展示，教师仍可在“已撤回”中查看记录。</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setWithdrawTarget(null)}>取消</Button><Button type="button" variant="danger" disabled={busy} onClick={async () => { if (!withdrawTarget) return; const result = await request(`/api/courses/${courseId}/notices/${withdrawTarget.id}`, { method: "DELETE" }, "通知已撤回"); if (result) { setNoticeItems((current) => current.map((notice) => notice.id === withdrawTarget.id ? { ...notice, status: "WITHDRAWN" } : notice)); setWithdrawTarget(null); } }}>确认撤回</Button></div></Dialog>
  </div>;
}
