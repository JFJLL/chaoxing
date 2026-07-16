"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FolderPlus, Pencil, Share2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type DriveClientFile = {
  id: string;
  name: string;
  kind: string;
  size: number;
  courseTitle?: string;
  shares?: Array<{ code: string }>;
  copilotCourses?: Array<{ id: string; title: string }>;
};

export function DriveClient({ files, courses, canManage = false, parentId, breadcrumbs }: { files: DriveClientFile[]; courses: Array<{ id: string; title: string }>; canManage?: boolean; parentId: string | null; breadcrumbs: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [visibleFiles, setVisibleFiles] = useState(files);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVisibleFiles(files);
  }, [files]);

  async function request(url: string, init: RequestInit, successText?: string) {
    setStatus(null);
    const response = await fetch(url, init);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
    if (!response.ok) {
      const message = typeof body === "object" && body && "error" in body ? String(body.error) : typeof body === "string" && body ? body : "操作失败";
      throw new Error(message);
    }
    if (successText) setStatus({ tone: "success", text: successText });
    return body;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
    } finally {
      setBusy(false);
    }
  }

  async function createFolder(formData: FormData) {
    await run(async () => {
      const body = await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), parentId }) }, "文件夹已创建");
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
    });
  }

  async function upload(formData: FormData) {
    await run(async () => {
      const body = await request("/api/drive", { method: "POST", body: formData });
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
      setStatus(
        body?.storage === "oss"
          ? { tone: "success", text: "文件已上传至 OSS" }
          : { tone: "error", text: "文件已上传到本地存储，未写入 OSS。请检查服务器 DRIVE_STORAGE_PROVIDER 是否为 oss，并用 pm2 restart cuc --update-env 重启。" }
      );
      setSelectedFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  async function share(id: string) { await run(async () => { await request(`/api/drive/${id}/share`, { method: "POST" }, "分享码已生成"); }); }
  async function attach(fileId: string, courseId: string) { await run(async () => { await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driveFileId: fileId, courseId }) }, "已添加到课程资料"); }); }
  async function rename(id: string, currentName: string) {
    const name = window.prompt("重命名", currentName);
    if (!name) return;
    await run(async () => {
      await request(`/api/drive/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "已重命名");
      setVisibleFiles((current) => current.map((file) => file.id === id ? { ...file, name } : file));
    });
  }
  async function remove(id: string) {
    await run(async () => {
      await request(`/api/drive/${id}`, { method: "DELETE" }, "已删除");
      setVisibleFiles((current) => current.filter((file) => file.id !== id));
    });
  }
  return (
    <div className="space-y-5">
      <nav aria-label="云盘路径" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/space/drive" className="hover:text-blue-600">我的云盘</Link>
        {breadcrumbs.map((item) => <span key={item.id} className="flex items-center gap-2"><span>/</span><Link href={`/space/drive?parentId=${encodeURIComponent(item.id)}`} className="hover:text-blue-600">{item.name}</Link></span>)}
      </nav>
      {canManage ? (
        <div className="grid gap-3 md:grid-cols-2">
          <form action={createFolder} className="flex gap-2">
            <Input name="name" placeholder="新文件夹" />
            <Button type="submit" disabled={busy}><FolderPlus className="h-4 w-4" />新建文件夹</Button>
          </form>
          <form action={upload} className="flex flex-col gap-2 rounded-md border border-[var(--cx-border)] bg-white p-3 sm:flex-row sm:items-center">
            <input type="hidden" name="parentId" value={parentId ?? ""} />
            <input
              ref={fileInputRef}
              id="drive-upload-file"
              name="file"
              type="file"
              className="sr-only"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")}
            />
            <label htmlFor="drive-upload-file" className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--cx-border)] bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              <UploadCloud className="h-4 w-4" />
              选择文件
            </label>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{selectedFileName || "未选择文件"}</span>
            <Button type="submit" disabled={busy || !selectedFileName}>
              <UploadCloud className="h-4 w-4" />
              {busy ? "上传中" : "上传"}
            </Button>
          </form>
        </div>
      ) : null}
      {status ? <p className={`rounded-md px-3 py-2 text-sm ${status.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.text}</p> : null}
      <div className="space-y-3">
        {visibleFiles.map((file) => (
          <article key={file.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--cx-border)] p-3">
            {file.kind === "folder" ? <Link href={`/space/drive?parentId=${encodeURIComponent(file.id)}`} className="font-medium text-blue-700 hover:underline">文件夹：{file.name}</Link> : <span className="font-medium">文件：{file.name}</span>}
            {file.courseTitle ? <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{file.courseTitle}</span> : null}
            {file.copilotCourses?.length ? <span className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">Copilot：{file.copilotCourses.map((course) => course.title).join("、")}</span> : null}
            <span className="text-sm text-slate-500">{file.size} bytes</span>
            {canManage && file.shares?.[0] ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">分享码 {file.shares[0].code}</span> : null}
            {file.kind === "file" ? <a href={`/api/drive/${file.id}?download=1`} className="inline-flex items-center gap-1 text-[var(--cx-blue)]"><Download className="h-4 w-4" />下载</a> : null}
            {canManage ? (
              <>
                <Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={() => rename(file.id, file.name)}><Pencil className="h-4 w-4" />重命名</Button>
                {file.kind === "file" ? <Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={() => share(file.id)}><Share2 className="h-4 w-4" />分享</Button> : null}
                {file.kind === "file" && courses[0] ? <Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={() => attach(file.id, courses[0].id)}>添加到课程资料</Button> : null}
                <Button type="button" variant="danger" className="h-8" disabled={busy} onClick={() => remove(file.id)}><Trash2 className="h-4 w-4" />删除</Button>
              </>
            ) : null}
          </article>
        ))}
        {!visibleFiles.length ? <p className="rounded-md border border-dashed border-[var(--cx-border)] p-6 text-sm text-slate-500">{canManage ? "暂无文件。" : "暂无已发布课程资料。"}</p> : null}
      </div>
    </div>
  );
}
