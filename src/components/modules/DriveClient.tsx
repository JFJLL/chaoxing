"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function DriveClient({ files, courses }: { files: Array<{ id: string; name: string; kind: string; size: number; shares?: Array<{ code: string }> }>; courses: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  async function createFolder(formData: FormData) { await fetch("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name") }) }); router.refresh(); }
  async function upload(formData: FormData) { await fetch("/api/drive", { method: "POST", body: formData }); router.refresh(); }
  async function share(id: string) { await fetch(`/api/drive/${id}/share`, { method: "POST" }); router.refresh(); }
  async function attach(fileId: string, courseId: string) { await fetch("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driveFileId: fileId, courseId }) }); router.refresh(); }
  async function rename(id: string, currentName: string) {
    const name = window.prompt("重命名", currentName);
    if (!name) return;
    await fetch(`/api/drive/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    router.refresh();
  }
  async function remove(id: string) { await fetch(`/api/drive/${id}`, { method: "DELETE" }); router.refresh(); }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2"><form action={createFolder} className="flex gap-2"><Input name="name" placeholder="新文件夹" /><Button type="submit">新建文件夹</Button></form><form action={upload} className="flex gap-2"><input name="file" type="file" className="rounded-md border p-2" /><Button type="submit">上传</Button></form></div>
      <div className="space-y-3">{files.map((file) => <article key={file.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--cx-border)] p-3"><span className="font-medium">{file.kind === "folder" ? "文件夹" : "文件"}：{file.name}</span><span className="text-sm text-slate-500">{file.size} bytes</span>{file.shares?.[0] ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">分享码 {file.shares[0].code}</span> : null}{file.kind === "file" ? <a href={`/api/drive/${file.id}?download=1`} className="text-[var(--cx-blue)]">下载</a> : null}<Button type="button" variant="secondary" className="h-8" onClick={() => rename(file.id, file.name)}>重命名</Button><Button type="button" variant="secondary" className="h-8" onClick={() => share(file.id)}>分享</Button>{courses[0] ? <Button type="button" variant="secondary" className="h-8" onClick={() => attach(file.id, courses[0].id)}>添加到课程资料</Button> : null}<Button type="button" variant="danger" className="h-8" onClick={() => remove(file.id)}>删除</Button></article>)}</div>
    </div>
  );
}
