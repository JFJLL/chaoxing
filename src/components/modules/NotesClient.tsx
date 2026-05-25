"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function NotesClient({ notes, courses }: { notes: Array<{ id: string; title: string; body: string; tags: Array<{ name: string }> }>; courses: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  async function create(formData: FormData) {
    await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), body: formData.get("body"), courseId: formData.get("courseId") || undefined, tags: String(formData.get("tags") || "").split(",").filter(Boolean) }) });
    router.refresh();
  }
  async function remove(id: string) { await fetch(`/api/notes/${id}`, { method: "DELETE" }); router.refresh(); }
  return (
    <div className="space-y-5">
      <form action={create} className="grid gap-3 md:grid-cols-2"><Input name="title" placeholder="笔记标题" /><Input name="tags" placeholder="标签，逗号分隔" /><select name="courseId" className="h-10 rounded-md border px-3"><option value="">不关联课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><Textarea name="body" placeholder="笔记内容" /><Button type="submit">保存</Button></form>
      <div className="grid gap-3 md:grid-cols-2">{notes.map((note) => <article key={note.id} className="rounded-md border border-[var(--cx-border)] p-4"><p className="font-medium">{note.title}</p><p className="mt-1 text-sm">{note.body}</p><p className="mt-2 text-xs text-slate-500">{note.tags.map((tag) => tag.name).join(", ")}</p><Button type="button" variant="danger" className="mt-3 h-8" onClick={() => remove(note.id)}>删除</Button></article>)}</div>
    </div>
  );
}
