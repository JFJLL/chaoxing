"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Download, File as FileIcon, Folder, FolderPlus, Pencil, Share2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilePicker } from "@/components/ui/FilePicker";
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
    <div className="space-y-6">
      <nav aria-label="云盘路径" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        <Link href="/space/drive" className="cx-focus-ring rounded-lg px-2 py-1.5 font-medium text-slate-700 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">我的云盘</Link>
        {breadcrumbs.map((item) => <span key={item.id} className="flex items-center gap-1.5"><ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" /><Link href={`/space/drive?parentId=${encodeURIComponent(item.id)}`} className="cx-focus-ring rounded-lg px-2 py-1.5 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">{item.name}</Link></span>)}
      </nav>
      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form action={createFolder} className="rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><FolderPlus className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-slate-900">新建文件夹</h2><p className="mt-0.5 text-xs text-slate-500">整理课程资料和共享文件。</p></div></div>
            <label className="mt-4 block space-y-1.5"><span className="text-sm font-medium text-slate-700">文件夹名称</span><Input name="name" placeholder="例如：课程课件" required /></label>
            <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={busy}><FolderPlus className="h-4 w-4" aria-hidden="true" />创建文件夹</Button>
          </form>
          <form action={upload} className="rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><UploadCloud className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-slate-900">上传文件</h2><p className="mt-0.5 text-xs text-slate-500">选择文件后再确认上传。</p></div></div>
            <input type="hidden" name="parentId" value={parentId ?? ""} />
            <FilePicker
              ref={fileInputRef}
              id="drive-upload-file"
              name="file"
              className="mt-4"
              label="选择要上传的文件"
              hint="支持当前课程允许的文件格式"
              selectedFileName={selectedFileName}
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")}
            />
            <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={busy || !selectedFileName}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {busy ? "上传中" : "上传"}
            </Button>
          </form>
        </div>
      ) : null}
      {status ? <p role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${status.tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{status.text}</p> : null}
      <div className="space-y-3">
        {visibleFiles.map((file) => (
          <article key={file.id} className="rounded-2xl border border-[var(--cx-border)] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]">{file.kind === "folder" ? <Folder className="h-5 w-5" aria-hidden="true" /> : <FileIcon className="h-5 w-5" aria-hidden="true" />}</span>
              <div className="min-w-0 flex-1">
                {file.kind === "folder" ? <Link href={`/space/drive?parentId=${encodeURIComponent(file.id)}`} className="cx-focus-ring rounded font-semibold text-slate-900 transition hover:text-[var(--cx-blue)]">{file.name}</Link> : <h2 className="truncate font-semibold text-slate-900">{file.name}</h2>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{file.kind === "folder" ? "文件夹" : formatBytes(file.size)}</span>
                  {file.courseTitle ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{file.courseTitle}</span> : null}
                  {file.copilotCourses?.length ? <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">Copilot：{file.copilotCourses.map((course) => course.title).join("、")}</span> : null}
                  {canManage && file.shares?.[0] ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">分享码 {file.shares[0].code}</span> : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {file.kind === "file" ? <a href={`/api/drive/${file.id}?download=1`} className="cx-focus-ring cx-tactile inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--cx-border-strong)] bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden="true" />下载</a> : null}
            {canManage ? (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => rename(file.id, file.name)}><Pencil className="h-4 w-4" aria-hidden="true" />重命名</Button>
                {file.kind === "file" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => share(file.id)}><Share2 className="h-4 w-4" aria-hidden="true" />分享</Button> : null}
                {file.kind === "file" && courses[0] ? <Button type="button" variant="secondary" disabled={busy} onClick={() => attach(file.id, courses[0].id)}>添加到课程资料</Button> : null}
                <Button type="button" variant="danger" disabled={busy} onClick={() => remove(file.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />删除</Button>
              </>
            ) : null}
            </div>
          </article>
        ))}
        {!visibleFiles.length ? <div className="rounded-2xl border border-dashed border-[var(--cx-border-strong)] bg-white p-8 text-center"><Folder className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">{canManage ? "这个文件夹还是空的" : "暂无已发布课程资料"}</p><p className="mt-1 text-xs text-slate-500">{canManage ? "在上方新建文件夹，或选择文件上传。" : "老师发布后，课程资料会显示在这里。"}</p></div> : null}
      </div>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
