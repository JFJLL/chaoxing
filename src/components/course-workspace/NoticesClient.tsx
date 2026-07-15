"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Pencil, Pin, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

type NoticeDto = {
  id: string;
  title: string;
  body: string;
  status: string;
  publishAt: string | null;
  pinned: boolean;
  authorName: string;
  readAt: string | null;
  readCount: number;
};

export function NoticesClient({ courseId, canManage, notices }: { courseId: string; canManage: boolean; notices: NoticeDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function create(formData: FormData) {
    const publishAt = String(formData.get("publishAt") || "");
    const intent = String(formData.get("intent") || "DRAFT");
    await request(`/api/courses/${courseId}/notices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        body: formData.get("body"),
        pinned: formData.get("pinned") === "on",
        status: intent,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null
      })
    });
  }

  async function edit(notice: NoticeDto) {
    const title = window.prompt("通知标题", notice.title)?.trim();
    if (!title) return;
    const body = window.prompt("通知内容", notice.body)?.trim();
    if (!body) return;
    await request(`/api/courses/${courseId}/notices/${notice.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }) });
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <form action={create} className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <h2 className="font-semibold text-slate-900">发布课程通知</h2>
          <Input name="title" required maxLength={200} placeholder="通知标题" />
          <Textarea name="body" required maxLength={10_000} placeholder="通知内容" className="min-h-28" />
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="space-y-1 text-sm text-slate-600"><span>定时发布（留空则立即发布）</span><Input name="publishAt" type="datetime-local" /></label>
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700"><input name="pinned" type="checkbox" />置顶</label>
          </div>
          <div className="flex gap-2">
            <Button name="intent" value="DRAFT" type="submit" variant="secondary" disabled={busy}>保存草稿</Button>
            <Button name="intent" value="PUBLISHED" type="submit" disabled={busy}><Send className="h-4 w-4" />发布通知</Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="space-y-3">
        {notices.map((notice) => (
          <article key={notice.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <Megaphone className="h-6 w-6 text-orange-500" />
              <div className="flex items-center gap-2">
                {notice.pinned ? <Pin className="h-4 w-4 text-orange-500" /> : null}
                {canManage ? <Badge tone={notice.status === "PUBLISHED" ? "green" : notice.status === "DRAFT" ? "orange" : "gray"}>{notice.status === "PUBLISHED" ? "已发布" : notice.status === "DRAFT" ? "草稿" : "已撤回"}</Badge> : null}
              </div>
            </div>
            <h2 className="mt-3 font-semibold text-slate-900">{notice.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{notice.body}</p>
            <p className="mt-3 text-xs text-slate-400">{notice.authorName} 发布{notice.publishAt ? ` · ${new Date(notice.publishAt).toLocaleString("zh-CN")}` : ""}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canManage ? <><span className="text-xs text-slate-500">已读 {notice.readCount} 人</span>{notice.status !== "WITHDRAWN" ? <><Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={() => edit(notice)}><Pencil className="h-4 w-4" />编辑</Button><Button type="button" variant="danger" className="h-8" disabled={busy} onClick={() => request(`/api/courses/${courseId}/notices/${notice.id}`, { method: "DELETE" })}><Trash2 className="h-4 w-4" />撤回</Button></> : null}</> : notice.readAt ? <Badge tone="green">已读</Badge> : <Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={() => request(`/api/courses/${courseId}/notices/${notice.id}/read`, { method: "POST" })}>标记已读</Button>}
            </div>
          </article>
        ))}
        {!notices.length ? <p className="text-sm text-slate-500">暂无通知。</p> : null}
      </div>
    </div>
  );
}
