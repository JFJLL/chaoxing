"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, ChevronDown, ChevronUp, Clock3, Download, Eye, FileText, Megaphone, Pencil, Pin, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

type NoticeAttachment = { id: string; name: string; mimeType: string | null; size: number };
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
  readerIds: string[];
  attachments: NoticeAttachment[];
};
type DriveFileOption = { id: string; name: string; path: string };
type NoticeTab = "PUBLISHED" | "SCHEDULED" | "DRAFT" | "WITHDRAWN";
const tabs: Array<{ id: NoticeTab; label: string }> = [
  { id: "PUBLISHED", label: "已发布" },
  { id: "SCHEDULED", label: "定时发布" },
  { id: "DRAFT", label: "草稿" },
  { id: "WITHDRAWN", label: "已撤回" }
];

function effectiveStatus(notice: NoticeDto): NoticeTab {
  if (notice.status === "PUBLISHED" && notice.publishAt && new Date(notice.publishAt) > new Date()) return "SCHEDULED";
  if (notice.status === "PUBLISHED") return "PUBLISHED";
  if (notice.status === "WITHDRAWN") return "WITHDRAWN";
  return "DRAFT";
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type ReturnedAttachment = NoticeAttachment | { nameSnapshot?: string; driveFile: NoticeAttachment };

function normalizeReturnedNotice(value: Omit<NoticeDto, "attachments"> & { attachments?: ReturnedAttachment[] }): NoticeDto {
  return {
    ...value,
    attachments: (value.attachments ?? []).map((attachment) => "driveFile" in attachment ? {
      id: attachment.driveFile.id,
      name: attachment.nameSnapshot ?? attachment.driveFile.name,
      mimeType: attachment.driveFile.mimeType,
      size: attachment.driveFile.size
    } : attachment)
  };
}

export function NoticesClient({
  courseId,
  canManage,
  notices,
  students,
  driveFiles
}: {
  courseId: string;
  canManage: boolean;
  notices: NoticeDto[];
  students: Array<{ id: string; name: string }>;
  driveFiles: DriveFileOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [noticeItems, setNoticeItems] = useState(notices);
  const [activeTab, setActiveTab] = useState<NoticeTab>("PUBLISHED");
  const [editor, setEditor] = useState<NoticeDto | "new" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<NoticeDto | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [publishAtDraft, setPublishAtDraft] = useState("");
  const [pinnedDraft, setPinnedDraft] = useState(false);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);

  useEffect(() => setNoticeItems(notices), [notices]);
  const visible = useMemo(() => canManage ? noticeItems.filter((notice) => effectiveStatus(notice) === activeTab) : noticeItems, [activeTab, canManage, noticeItems]);
  const mentionMatch = bodyDraft.match(/(?:^|\s)@([^@\n]*)$/);
  const mentionQuery = mentionMatch?.[1]?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const mentionFiles = mentionMatch ? driveFiles.filter((file) => `${file.name} ${file.path}`.toLocaleLowerCase("zh-CN").includes(mentionQuery)).slice(0, 6) : [];
  const unavailableEditorAttachments = editor && editor !== "new"
    ? editor.attachments.filter((attachment) => !driveFiles.some((file) => file.id === attachment.id))
    : [];

  function openEditor(target: NoticeDto | "new") {
    const current = target === "new" ? null : target;
    setEditor(target);
    setTitleDraft(current?.title ?? "");
    setBodyDraft(current?.body ?? "");
    setPublishAtDraft(toLocalDateTime(current?.publishAt ?? null));
    setPinnedDraft(current?.pinned ?? false);
    setSelectedAttachmentIds(current?.attachments.map((attachment) => attachment.id) ?? []);
    setError("");
  }

  async function request(url: string, init: RequestInit, successText: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string; notice?: NoticeDto; read?: { readAt: string } } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setSuccess(successText);
      router.refresh();
      return body ?? {};
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(intent: "DRAFT" | "PUBLISHED") {
    const editing = editor !== "new" && editor;
    const publishAt = publishAtDraft ? new Date(publishAtDraft).toISOString() : null;
    const result = await request(
      editing ? `/api/courses/${courseId}/notices/${editing.id}` : `/api/courses/${courseId}/notices`,
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft, body: bodyDraft, pinned: pinnedDraft, status: intent, publishAt, attachmentIds: selectedAttachmentIds })
      },
      intent === "DRAFT" ? "草稿已保存" : publishAt && new Date(publishAt) > new Date() ? "通知已设置定时发布" : "通知已发布"
    );
    if (result?.notice) {
      const notice = normalizeReturnedNotice(result.notice);
      setNoticeItems((current) => editing ? current.map((item) => item.id === notice.id ? notice : item) : [notice, ...current]);
      setEditor(null);
      setActiveTab(intent === "DRAFT" ? "DRAFT" : publishAt && new Date(publishAt) > new Date() ? "SCHEDULED" : "PUBLISHED");
    }
  }

  function addMention(file: DriveFileOption) {
    const start = mentionMatch ? bodyDraft.slice(0, bodyDraft.length - mentionMatch[0].length) : `${bodyDraft} `;
    const leading = mentionMatch?.[0].startsWith(" ") ? " " : "";
    setBodyDraft(`${start}${leading}@${file.name} `);
    setSelectedAttachmentIds((current) => current.includes(file.id) ? current : [...current, file.id]);
  }

  async function toggleExpanded(notice: NoticeDto) {
    const opening = expandedId !== notice.id;
    setExpandedId(opening ? notice.id : null);
    if (opening && !canManage && !notice.readAt) {
      const result = await request(`/api/courses/${courseId}/notices/${notice.id}/read`, { method: "POST" }, "已记录阅读");
      if (result?.read) setNoticeItems((current) => current.map((item) => item.id === notice.id ? { ...item, readAt: result.read!.readAt } : item));
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex w-fit rounded-full bg-slate-100 p-1">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-full px-4 py-2 text-sm transition ${activeTab === tab.id ? "bg-white font-medium text-[#8E3425] shadow-sm" : "text-slate-500"}`}>{tab.label}<span className="ml-1 text-xs">{noticeItems.filter((notice) => effectiveStatus(notice) === tab.id).length}</span></button>)}</div><Button type="button" onClick={() => openEditor("new")}><Plus className="h-4 w-4" />发布通知</Button></div> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="space-y-3">
        {visible.map((notice) => {
          const status = effectiveStatus(notice);
          const expanded = expandedId === notice.id;
          const unread = students.filter((student) => !notice.readerIds.includes(student.id));
          return (
            <article key={notice.id} className="rounded-2xl border border-slate-100 bg-white p-5 transition hover:border-[#F9ECE7]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Megaphone className="h-5 w-5 text-orange-500" />{notice.pinned ? <Pin className="h-4 w-4 text-orange-500" /> : null}{canManage ? <Badge tone={status === "PUBLISHED" ? "green" : status === "DRAFT" ? "orange" : "gray"}>{tabs.find((tab) => tab.id === status)?.label}</Badge> : !notice.readAt ? <Badge tone="orange">未读</Badge> : <Badge tone="green">已读</Badge>}</div>
                  <h2 className="mt-3 font-semibold text-slate-900">{notice.title}</h2>
                  <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-2"}`}>{notice.body}</p>
                  {notice.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{notice.attachments.map((file) => <span key={file.id} className="inline-flex items-center gap-1 rounded-xl border border-[#F9ECE7] bg-[#FDF3F0] px-2 py-1 text-xs font-medium text-[#8E3425]"><FileText className="h-4 w-4" /><span className="max-w-48 truncate px-1">{file.name}</span><a href={`/api/drive/${file.id}?preview=1`} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1 hover:bg-[#F9ECE7]">查看</a><a href={`/api/drive/${file.id}?download=1`} aria-label={`下载 ${file.name}`} className="rounded-lg p-1.5 hover:bg-[#F9ECE7]"><Download className="h-3.5 w-3.5" /></a></span>)}</div> : null}
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{notice.authorName}</span>{notice.publishAt ? <><Clock3 className="h-3.5 w-3.5" /><span>{status === "SCHEDULED" ? "计划发布" : "发布于"} {new Date(notice.publishAt).toLocaleString("zh-CN")}</span></> : null}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" className="h-8" onClick={() => void toggleExpanded(notice)}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{expanded ? "收起" : "查看内容"}</Button>{canManage && status !== "WITHDRAWN" ? <><Button type="button" variant="secondary" className="h-8" onClick={() => openEditor(notice)}><Pencil className="h-4 w-4" />编辑</Button><Button type="button" variant="danger" className="h-8" onClick={() => setWithdrawTarget(notice)}><Trash2 className="h-4 w-4" />撤回</Button></> : null}</div>
              </div>
              {canManage && expanded ? <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[180px_1fr]"><div><p className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4 text-[#A8402F]" />已读 {notice.readCount} / {students.length}</p><p className="mt-1 text-xs text-slate-500">阅读率 {students.length ? Math.round(notice.readCount / students.length * 100) : 0}%</p></div><div><p className="flex items-center gap-2 text-sm font-medium"><UsersRound className="h-4 w-4 text-orange-500" />未读学生</p><p className="mt-1 text-sm text-slate-500">{unread.length ? unread.map((student) => student.name).join("、") : "全部学生已读"}</p></div></div> : null}
            </article>
          );
        })}
        {!visible.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">{canManage ? `暂无${tabs.find((tab) => tab.id === activeTab)?.label}通知。` : "当前暂无通知。"}</p> : null}
      </div>

      <Dialog open={Boolean(editor)} title={editor === "new" ? "发布通知" : "编辑通知"} panelClassName="!max-w-4xl" onClose={() => !busy && setEditor(null)}>
        <div className="min-w-0 space-y-4 overflow-x-hidden">
          <label className="block space-y-1 text-sm"><span>通知标题</span><Input required maxLength={200} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /></label>
          <label className="relative block space-y-1 text-sm"><span>通知内容</span><Textarea required maxLength={10_000} value={bodyDraft} onChange={(event) => setBodyDraft(event.target.value)} className="min-h-40" placeholder="输入 @ 可引用已向学生开放的课程文件" />{mentionFiles.length ? <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><p className="px-2 py-1 text-xs text-slate-400">选择要 @ 的课程文件</p>{mentionFiles.map((file) => <button key={file.id} type="button" onClick={() => addMention(file)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[#FDF3F0]"><AtSign className="h-4 w-4 text-[#A8402F]" /><span className="min-w-0"><span className="block truncate">{file.name}</span><span className="block truncate text-xs text-slate-400">{file.path}</span></span></button>)}</div> : null}</label>
          <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-medium text-slate-700">课程文件</legend><p className="text-xs text-slate-500">这里只显示已向学生开放的文件，AI产物不会出现。</p><div className="max-h-48 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 p-3">{unavailableEditorAttachments.map((file) => <label key={file.id} className="flex min-w-0 items-start gap-2 overflow-hidden rounded-lg bg-amber-50 p-2 text-sm text-amber-800"><input type="checkbox" className="mt-0.5 shrink-0" checked={selectedAttachmentIds.includes(file.id)} onChange={() => setSelectedAttachmentIds((current) => current.filter((id) => id !== file.id))} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{file.name}</span><span className="block truncate text-xs">该文件已删除或不再向学生开放，请取消勾选后保存。</span></span></label>)}{driveFiles.map((file) => <label key={file.id} className="flex min-w-0 items-start gap-2 overflow-hidden rounded-lg p-2 text-sm hover:bg-slate-50"><input type="checkbox" className="mt-0.5 shrink-0" checked={selectedAttachmentIds.includes(file.id)} onChange={() => setSelectedAttachmentIds((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id])} /><span className="min-w-0 flex-1"><span className="block max-w-full truncate font-medium text-slate-700" title={file.name}>{file.name}</span><span className="block max-w-full truncate text-xs text-slate-400" title={file.path}>{file.path}</span></span></label>)}{!driveFiles.length && !unavailableEditorAttachments.length ? <p className="py-4 text-center text-xs text-slate-500">暂无已向学生开放的课程文件。</p> : null}</div></fieldset>
          <label className="block space-y-1 text-sm"><span>定时发布（留空则立即发布）</span><Input type="datetime-local" value={publishAtDraft} onChange={(event) => setPublishAtDraft(event.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinnedDraft} onChange={(event) => setPinnedDraft(event.target.checked)} />置顶通知</label>
          {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy || !titleDraft.trim() || !bodyDraft.trim()} onClick={() => void save("DRAFT")}>保存草稿</Button><Button type="button" disabled={busy || !titleDraft.trim() || !bodyDraft.trim()} onClick={() => void save("PUBLISHED")}><Send className="h-4 w-4" />发布通知</Button></div>
        </div>
      </Dialog>

      <Dialog open={Boolean(withdrawTarget)} title="撤回通知" onClose={() => !busy && setWithdrawTarget(null)}><p className="text-sm leading-6 text-slate-600">撤回“{withdrawTarget?.title}”后，学生端将立即停止展示，教师仍可在“已撤回”中查看记录。</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setWithdrawTarget(null)}>取消</Button><Button type="button" variant="danger" disabled={busy} onClick={async () => { if (!withdrawTarget) return; const result = await request(`/api/courses/${courseId}/notices/${withdrawTarget.id}`, { method: "DELETE" }, "通知已撤回"); if (result) { setNoticeItems((current) => current.map((notice) => notice.id === withdrawTarget.id ? { ...notice, status: "WITHDRAWN" } : notice)); setWithdrawTarget(null); } }}>确认撤回</Button></div></Dialog>
    </div>
  );
}
