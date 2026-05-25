"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function GroupWorkspace({ groups }: { groups: Array<{ id: string; name: string; description: string | null; posts: Array<{ id: string; title: string; body: string; comments: Array<unknown> }>; members: Array<unknown> }> }) {
  const router = useRouter();
  async function create(formData: FormData) {
    await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), description: formData.get("description") }) });
    router.refresh();
  }
  async function post(groupId: string, formData: FormData) {
    await fetch(`/api/groups/${groupId}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), body: formData.get("body") }) });
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <form action={create} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><Input name="name" placeholder="小组名称" /><Input name="description" placeholder="小组简介" /><Button type="submit">创建小组</Button></form>
      {groups.map((group) => (
        <section key={group.id} className="rounded-md border border-[var(--cx-border)] p-4">
          <h2 className="font-semibold">{group.name}</h2>
          <p className="text-sm text-slate-500">{group.description} · 成员 {group.members.length}</p>
          <form action={(formData) => post(group.id, formData)} className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]"><Input name="title" placeholder="帖子标题" /><Textarea name="body" placeholder="帖子内容" className="min-h-10" /><Button type="submit">发布</Button></form>
          <div className="mt-3 space-y-2">{group.posts.map((post) => <article key={post.id} className="rounded bg-slate-50 p-3"><p className="font-medium">{post.title}</p><p className="text-sm">{post.body}</p><p className="text-xs text-slate-500">评论 {post.comments.length}</p></article>)}</div>
        </section>
      ))}
    </div>
  );
}
