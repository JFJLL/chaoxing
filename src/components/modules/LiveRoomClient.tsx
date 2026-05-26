"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LiveRoomClient({ sessions }: { sessions: Array<{ id: string; title: string; status: string; participants: Array<unknown>; messages: Array<{ body: string }> }> }) {
  const router = useRouter();
  async function create(formData: FormData) { await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), startsAt: formData.get("startsAt") || undefined }) }); router.refresh(); }
  async function action(id: string, actionName: string) { await fetch(`/api/live/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }); router.refresh(); }
  async function chat(id: string, formData: FormData) { await fetch(`/api/live/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: formData.get("body") }) }); router.refresh(); }
  return <div className="space-y-5"><form action={create} className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><Input name="title" placeholder="直播标题" /><Input name="startsAt" type="datetime-local" /><Button type="submit">创建直播</Button></form>{sessions.map((session) => <section key={session.id} className="rounded-md border border-[var(--cx-border)] p-4"><h2 className="font-semibold">{session.title}</h2><p className="text-sm text-slate-500">{session.status} · 参与 {session.participants.length} · 消息 {session.messages.length}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" className="h-8" onClick={() => action(session.id, "start")}>开始</Button><Button type="button" variant="secondary" className="h-8" onClick={() => action(session.id, "join")}>加入</Button><Button type="button" variant="secondary" className="h-8" onClick={() => action(session.id, "leave")}>离开</Button><Button type="button" variant="danger" className="h-8" onClick={() => action(session.id, "end")}>结束</Button></div><form action={(formData) => chat(session.id, formData)} className="mt-3 flex gap-2"><Input name="body" placeholder="聊天消息" /><Button type="submit" variant="secondary">发送</Button></form><div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{session.messages.map((message, index) => <p key={index}>{message.body}</p>)}</div></section>)}</div>;
}
