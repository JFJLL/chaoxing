"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, NotebookPen, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

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
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--cx-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="sr-only">搜索笔记</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索标题或正文" className="pl-9" />
          </label>
          <label className="relative block">
            <span className="sr-only">按标签筛选</span>
            <Tag className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Select value={tag} onChange={(event) => setTag(event.target.value)} className="pl-9">
              <option value="">全部标签</option>
              {allTags.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><NotebookPen className="h-5 w-5" aria-hidden="true" /></span>
          <div><h2 className="font-semibold text-slate-900">新建笔记</h2><p className="mt-0.5 text-xs text-slate-500">记录正文，并按需关联课程和标签。</p></div>
        </div>
        <form action={create} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">标题</span><Input name="title" placeholder="输入笔记标题" required /></label>
          <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">标签</span><Input name="tags" placeholder="多个标签用逗号分隔" /></label>
          <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">关联课程</span><Select name="courseId"><option value="">不关联课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>
          <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium text-slate-700">正文</span><Textarea name="body" placeholder="记录灵感、课堂重点或待办事项" required /></label>
          <div className="md:col-span-2 md:flex md:justify-end"><Button type="submit" className="w-full md:w-auto"><Plus className="h-4 w-4" aria-hidden="true" />保存笔记</Button></div>
        </form>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleNotes.map((note) => (
          <article key={note.id} className="rounded-2xl border border-[var(--cx-border)] bg-white p-5 shadow-sm">
            {editingId === note.id ? (
              <form action={(formData) => update(note.id, formData)} className="space-y-3">
                <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">标题</span><Input name="title" defaultValue={note.title} required /></label>
                <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">标签</span><Input name="tags" defaultValue={note.tags.map((item) => item.name).join(",")} /></label>
                <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">关联课程</span><Select name="courseId"><option value="">不关联课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>
                <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">正文</span><Textarea name="body" defaultValue={note.body} required /></label>
                <div className="flex flex-wrap gap-2"><Button type="submit"><Pencil className="h-4 w-4" aria-hidden="true" />保存修改</Button><Button type="button" variant="secondary" onClick={() => setEditingId("")}><X className="h-4 w-4" aria-hidden="true" />取消</Button></div>
              </form>
            ) : (
              <>
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><BookOpen className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0"><h2 className="font-semibold text-slate-900">{note.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{note.body}</p></div></div>
                {note.tags.length ? <div className="mt-4 flex flex-wrap gap-2" aria-label="笔记标签">{note.tags.map((item) => <span key={item.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">#{item.name}</span>)}</div> : null}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="secondary" onClick={() => setEditingId(note.id)}><Pencil className="h-4 w-4" aria-hidden="true" />编辑</Button><Button type="button" variant="danger" onClick={() => remove(note.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />删除</Button></div>
              </>
            )}
          </article>
        ))}
      </div>
      {!visibleNotes.length ? <div className="rounded-2xl border border-dashed border-[var(--cx-border-strong)] bg-white p-8 text-center"><NotebookPen className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">没有符合条件的笔记</p><p className="mt-1 text-xs text-slate-500">调整搜索条件，或在上方创建第一条笔记。</p></div> : null}
    </div>
  );
}
