"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function InboxClient({ messages, contacts, activeBox, initialReceiverId }: { messages: Array<{ id: string; subject: string; body: string; readAt: Date | null; sender: { name: string }; receiver: { name: string } }>; contacts: Array<{ id: string; name: string }>; activeBox: "inbox" | "sent" | "archived"; initialReceiverId?: string }) {
  const router = useRouter();
  const [receiverId, setReceiverId] = useState(initialReceiverId && contacts.some((contact) => contact.id === initialReceiverId) ? initialReceiverId : contacts[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(messages[0]?.id ?? "");
  const selectedMessage = messages.find((message) => message.id === selectedId);
  async function send(formData: FormData) {
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId, subject: formData.get("subject"), body: formData.get("body") }) });
    router.refresh();
  }
  async function update(id: string, payload: object, method = "PUT") {
    await fetch(`/api/inbox/${id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    router.refresh();
  }
  const tabs = [
    { key: "inbox", label: "收件箱" },
    { key: "sent", label: "已发送" },
    { key: "archived", label: "归档" }
  ] as const;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <form action={send} className="space-y-3 rounded-md border border-[var(--cx-border)] p-4">
        <h2 className="font-semibold">写消息</h2>
        <select value={receiverId} onChange={(event) => setReceiverId(event.target.value)} className="h-10 w-full rounded-md border px-3">
          {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
        </select>
        <Input name="subject" placeholder="主题" className="w-full" />
        <Textarea name="body" placeholder="内容" className="w-full" />
        <Button type="submit">发送</Button>
      </form>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link key={tab.key} href={`/space/inbox?box=${tab.key}`} className={`rounded-md px-3 py-1.5 text-sm ${activeBox === tab.key ? "bg-[var(--cx-blue)] text-white" : "bg-slate-100 text-slate-600"}`}>
              {tab.label}
            </Link>
          ))}
        </div>
        {selectedMessage ? (
          <section className="rounded-md border border-[var(--cx-border)] bg-slate-50 p-4">
            <p className="font-medium">{selectedMessage.subject}</p>
            <p className="mt-1 text-sm text-slate-500">来自 {selectedMessage.sender.name}，发给 {selectedMessage.receiver.name}</p>
            <p className="mt-3 text-sm">{selectedMessage.body}</p>
          </section>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="rounded-md border border-[var(--cx-border)] p-4">
            <p className="font-medium">{message.subject} {!message.readAt ? <span className="text-red-500">未读</span> : null}</p>
            <p className="text-sm text-slate-500">来自 {message.sender.name}，发给 {message.receiver.name}</p>
            <p className="mt-2 text-sm">{message.body}</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="secondary" className="h-8" onClick={() => setSelectedId(message.id)}>查看</Button>
              <Button type="button" variant="secondary" className="h-8" onClick={() => update(message.id, { read: true })}>标记已读</Button>
              <Button type="button" variant="secondary" className="h-8" onClick={() => update(message.id, { archive: true })}>归档</Button>
              <Button type="button" variant="danger" className="h-8" onClick={() => update(message.id, {}, "DELETE")}>删除</Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
