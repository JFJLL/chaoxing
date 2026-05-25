"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function TopicManager({ folders, topics }: { folders: Array<{ id: string; title: string }>; topics: Array<{ id: string; title: string; description: string | null; status: string }> }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  async function create(type: "folder" | "topic") {
    await fetch("/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, title, description }) });
    setTitle("");
    setDescription("");
    router.refresh();
  }
  async function publish(id: string, status: string) {
    await fetch(`/api/topics/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto]">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="专题或文件夹名称" />
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="专题内容" className="min-h-10" />
        <Button type="button" onClick={() => create("topic")} disabled={!title}>新建专题</Button>
        <Button type="button" variant="secondary" onClick={() => create("folder")} disabled={!title}>新建文件夹</Button>
      </div>
      <section>
        <h2 className="font-semibold">全部专题</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {folders.map((folder) => <article key={folder.id} className="rounded-md border border-[var(--cx-border)] p-3">文件夹：{folder.title}</article>)}
          {topics.map((topic) => (
            <article key={topic.id} className="rounded-md border border-[var(--cx-border)] p-3">
              <p className="font-medium">{topic.title}</p>
              <p className="mt-1 text-sm text-slate-500">{topic.description}</p>
              <Button type="button" variant="secondary" className="mt-3 h-8" onClick={() => publish(topic.id, topic.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}>{topic.status === "PUBLISHED" ? "取消发布" : "发布"}</Button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
