"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function InboxClient({ messages, contacts }: { messages: Array<{ id: string; subject: string; body: string; readAt: Date | null; sender: { name: string }; receiver: { name: string } }>; contacts: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [receiverId, setReceiverId] = useState(contacts[0]?.id ?? "");
  async function send(formData: FormData) {
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId, subject: formData.get("subject"), body: formData.get("body") }) });
    router.refresh();
  }
  async function update(id: string, payload: object, method = "PUT") {
    await fetch(`/api/inbox/${id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    router.refresh();
  }
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
        {messages.map((message) => (
          <article key={message.id} className="rounded-md border border-[var(--cx-border)] p-4">
            <p className="font-medium">{message.subject} {!message.readAt ? <span className="text-red-500">未读</span> : null}</p>
            <p className="text-sm text-slate-500">来自 {message.sender.name}，发给 {message.receiver.name}</p>
            <p className="mt-2 text-sm">{message.body}</p>
            <div className="mt-3 flex gap-2">
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
