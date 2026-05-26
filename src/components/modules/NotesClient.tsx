"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function NotesClient({ notes, courses }: { notes: Array<{ id: string; title: string; body: string; tags: Array<{ name: string }> }>; courses: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [editingId, setEditingId] = useState("");
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags.map((item) => item.name)))).sort(), [notes]);
  const visibleNotes = notes.filter((note) => {
    const matchesText = `${note.title} ${note.body}`.toLowerCase().includes(q.toLowerCase());
    const matchesTag = !tag || note.tags.some((item) => item.name === tag);
    return matchesText && matchesTag;
  });
  async function create(formData: FormData) {
    await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), body: formData.get("body"), courseId: formData.get("courseId") || undefined, tags: String(formData.get("tags") || "").split(",").filter(Boolean) }) });
    router.refresh();
  }
  async function update(id: string, formData: FormData) {
    await fetch(`/api/notes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), body: formData.get("body"), courseId: formData.get("courseId") || undefined, tags: String(formData.get("tags") || "").split(",").filter(Boolean) }) });
    setEditingId("");
    router.refresh();
  }
  async function remove(id: string) { await fetch(`/api/notes/${id}`, { method: "DELETE" }); router.refresh(); }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索笔记" />
        <select value={tag} onChange={(event) => setTag(event.target.value)} className="h-10 rounded-md border px-3">
          <option value="">全部标签</option>
          {allTags.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <form action={create} className="grid gap-3 md:grid-cols-2"><Input name="title" placeholder="笔记标题" /><Input name="tags" placeholder="标签，逗号分隔" /><select name="courseId" className="h-10 rounded-md border px-3"><option value="">不关联课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><Textarea name="body" placeholder="笔记内容" /><Button type="submit">保存</Button></form>
      <div className="grid gap-3 md:grid-cols-2">{visibleNotes.map((note) => <article key={note.id} className="rounded-md border border-[var(--cx-border)] p-4">{editingId === note.id ? <form action={(formData) => update(note.id, formData)} className="space-y-3"><Input name="title" defaultValue={note.title} /><Input name="tags" defaultValue={note.tags.map((item) => item.name).join(",")} /><select name="courseId" className="h-10 w-full rounded-md border px-3"><option value="">不关联课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><Textarea name="body" defaultValue={note.body} /><div className="flex gap-2"><Button type="submit" className="h-8">保存修改</Button><Button type="button" variant="secondary" className="h-8" onClick={() => setEditingId("")}>取消</Button></div></form> : <><p className="font-medium">{note.title}</p><p className="mt-1 text-sm">{note.body}</p><p className="mt-2 text-xs text-slate-500">{note.tags.map((item) => item.name).join(", ")}</p><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" className="h-8" onClick={() => setEditingId(note.id)}>编辑</Button><Button type="button" variant="danger" className="h-8" onClick={() => remove(note.id)}>删除</Button></div></>}</article>)}</div>
    </div>
  );
}
