"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCheck, ImageIcon, Inbox, Loader2, Mail, Paperclip, Reply, Search, Send, Trash2, X } from "lucide-react";
import { MessageAttachmentCards } from "@/components/modules/MessageAttachmentCards";

type Attachment = { id: string; kind: string; fileName: string; mimeType: string | null; byteSize: number; driveFileId: string | null };
type Message = {
  id: string;
  subject: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  sender: { id: string; name: string; role: string };
  receiver: { id: string; name: string; role: string };
  attachments: Attachment[];
};
type Contact = { id: string; name: string; role: string };
type ReferenceFile = { id: string; name: string; mimeType: string | null; size: number };
type Box = "inbox" | "sent" | "archived";

function formatTime(value: Date) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function InboxClient({ messages, contacts, referenceFiles, activeBox, initialReceiverId }: {
  messages: Message[];
  contacts: Contact[];
  referenceFiles: ReferenceFile[];
  activeBox: Box;
  initialReceiverId?: string;
}) {
  const router = useRouter();
  const [receiverId, setReceiverId] = useState(initialReceiverId && contacts.some((contact) => contact.id === initialReceiverId) ? initialReceiverId : contacts[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(messages[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(Boolean(initialReceiverId));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const selectedMessage = messages.find((message) => message.id === selectedId) ?? null;
  const filteredMessages = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return messages;
    return messages.filter((message) => `${message.subject} ${message.body} ${message.sender.name} ${message.receiver.name}`.toLowerCase().includes(keyword));
  }, [messages, query]);

  async function update(id: string, payload: object, method = "PUT") {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/inbox/${id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("操作未完成，请稍后重试");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusyId("");
    }
  }

  function replyTo(message: Message) {
    const peerId = activeBox === "sent" ? message.receiver.id : message.sender.id;
    if (contacts.some((contact) => contact.id === peerId)) setReceiverId(peerId);
    setSubject(message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`);
    setBody("");
    setComposeOpen(true);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!receiverId || !subject.trim() || !body.trim()) {
      setError("请填写收件人、主题和消息内容");
      return;
    }
    setSending(true);
    setError("");
    try {
      const payload = new FormData(form);
      payload.set("receiverId", receiverId);
      payload.set("subject", subject.trim());
      payload.set("body", body.trim());
      payload.set("referenceFileIds", JSON.stringify(selectedReferenceIds));
      const response = await fetch("/api/inbox", { method: "POST", body: payload });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "消息发送失败");
      form.reset();
      setSubject("");
      setBody("");
      setSelectedReferenceIds([]);
      setComposeOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "消息发送失败");
    } finally {
      setSending(false);
    }
  }

  const tabs: Array<{ key: Box; label: string; icon: typeof Inbox }> = [
    { key: "inbox", label: "收件箱", icon: Inbox },
    { key: "sent", label: "已发送", icon: Send },
    { key: "archived", label: "已归档", icon: Archive }
  ];

  return <div className="space-y-5">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-5 sm:flex-row sm:items-center">
      <div><p className="text-sm font-medium text-[#A8402F]">沟通中心</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">收信箱</h1><p className="mt-2 text-sm text-slate-500">集中处理学生问题、课程图片和引用文件。</p></div>
      <button type="button" data-teacher-onboarding="compose-message" onClick={() => { setComposeOpen(true); setError(""); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#A8402F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8E3425]"><Mail className="h-4 w-4" />写消息</button>
    </header>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[660px] xl:grid-cols-[230px_350px_minmax(0,1fr)]">
        <aside className="border-b border-slate-100 bg-slate-50/70 p-4 xl:border-b-0 xl:border-r">
          <div className="space-y-1">{tabs.map((tab) => {
            const Icon = tab.icon;
            return <Link key={tab.key} href={`/space/inbox?box=${tab.key}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${activeBox === tab.key ? "bg-[#A8402F] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}><Icon className="h-4 w-4" />{tab.label}</Link>;
          })}</div>
          <div className="mt-6 border-t border-slate-200 pt-5"><p className="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">写信提醒</p><p className="mt-2 px-2 text-xs leading-5 text-slate-500">每条消息最多添加 5 个本地附件和 5 个云盘引用文件。图片会在对话中直接预览。</p></div>
        </aside>

        <section className="border-b border-slate-100 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-100 p-4"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题、内容或联系人" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#D07865] focus:bg-white" /></label></div>
          <div className="max-h-[570px] overflow-y-auto">{filteredMessages.length ? filteredMessages.map((message) => <button key={message.id} type="button" onClick={() => { setSelectedId(message.id); if (activeBox === "inbox" && !message.readAt) void update(message.id, { read: true }); }} className={`w-full border-b border-slate-100 px-4 py-4 text-left transition ${selectedId === message.id ? "bg-[#FDF3F0]/70" : "hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><p className={`line-clamp-1 text-sm ${message.readAt ? "font-medium text-slate-700" : "font-semibold text-slate-950"}`}>{message.subject}</p><time className="shrink-0 text-xs text-slate-400">{formatTime(message.createdAt)}</time></div><p className="mt-1 text-xs text-slate-500">{activeBox === "sent" ? `发给 ${message.receiver.name}` : `来自 ${message.sender.name}`}</p><p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{message.body}</p>{message.attachments.length ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#A8402F]"><Paperclip className="h-3.5 w-3.5" />{message.attachments.length} 个附件</p> : null}</button>) : <div className="p-10 text-center text-sm text-slate-500">这个邮箱暂时没有消息</div>}</div>
        </section>

        <section className="min-w-0 bg-white">
          {selectedMessage ? <div className="flex min-h-[420px] flex-col"><header className="border-b border-slate-100 p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h2 className="text-lg font-semibold text-slate-900">{selectedMessage.subject}</h2><p className="mt-2 text-sm text-slate-500">{activeBox === "sent" ? `发给 ${selectedMessage.receiver.name}` : `来自 ${selectedMessage.sender.name}`} · {new Date(selectedMessage.createdAt).toLocaleString("zh-CN")}</p></div><div className="flex gap-1"><button type="button" title="回复" onClick={() => replyTo(selectedMessage)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#A8402F]"><Reply className="h-4 w-4" /></button><button type="button" title="标记已读" disabled={busyId === selectedMessage.id} onClick={() => void update(selectedMessage.id, { read: true })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><CheckCheck className="h-4 w-4" /></button><button type="button" title="归档" disabled={busyId === selectedMessage.id} onClick={() => void update(selectedMessage.id, { archive: true })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Archive className="h-4 w-4" /></button><button type="button" title="删除" disabled={busyId === selectedMessage.id} onClick={() => void update(selectedMessage.id, {}, "DELETE")} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></div></header><div className="flex-1 p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedMessage.body}</p><MessageAttachmentCards messageId={selectedMessage.id} attachments={selectedMessage.attachments} /></div><footer className="border-t border-slate-100 p-4"><button type="button" onClick={() => replyTo(selectedMessage)} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"><Reply className="h-4 w-4" />回复这条消息</button></footer></div> : <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><Inbox className="h-10 w-10 text-slate-300" /><p className="mt-4 font-medium text-slate-700">选择一封消息开始阅读</p><p className="mt-1 text-sm text-slate-500">需要新建沟通时，可使用右上角“写消息”。</p></div>}
        </section>
      </div>
    </section>

    {composeOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><form onSubmit={send} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-lg font-semibold text-slate-900">新建消息</h2><p className="mt-1 text-sm text-slate-500">可附带图片、文档或引用自己的云盘文件。</p></div><button type="button" disabled={sending} onClick={() => setComposeOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><div className="space-y-4 p-6"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">收件人</span><select value={receiverId} onChange={(event) => setReceiverId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#D07865]">{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role === "TEACHER" ? "教师" : "学生"}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">主题</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} placeholder="概括这次沟通的主题" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#D07865]" /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">消息内容</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={6} placeholder="清楚描述问题、背景或回复内容" className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-[#D07865]" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><ImageIcon className="h-4 w-4" />图片或本地文件</span><input name="attachments" type="file" multiple accept="image/jpeg,image/png,image/webp,.pdf,.docx,.pptx,.txt,.md" className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FDF3F0] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[#8E3425]" /><p className="mt-1 text-xs text-slate-500">最多 5 个，每个不超过 15MB。</p></label><label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Paperclip className="h-4 w-4" />引用我的云盘文件</span><select multiple value={selectedReferenceIds} onChange={(event) => setSelectedReferenceIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} className="h-24 w-full rounded-xl border border-slate-200 p-2 text-sm outline-none focus:border-[#D07865]">{referenceFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><p className="mt-1 text-xs text-slate-500">按住 Ctrl 或 ⌘ 可多选，最多 5 个。</p></label></div></div><footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4"><button type="button" disabled={sending} onClick={() => setComposeOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">取消</button><button type="submit" disabled={sending || !contacts.length} className="inline-flex items-center gap-2 rounded-xl bg-[#A8402F] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#8E3425] disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "发送中…" : "发送消息"}</button></footer></form></div> : null}
  </div>;
}
