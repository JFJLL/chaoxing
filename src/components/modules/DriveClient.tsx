"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Download, File as FileIcon, Folder, FolderPlus, LoaderCircle, Move, Pencil, Share2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FilePicker } from "@/components/ui/FilePicker";
import { Input, Select } from "@/components/ui/Input";

type DriveClientFile = {
  id: string;
  parentId?: string | null;
  name: string;
  kind: string;
  size: number;
  courseTitle?: string;
  shares?: Array<{ code: string }>;
  copilotCourses?: Array<{ id: string; title: string }>;
};

type DriveFolder = { id: string; name: string; parentId: string | null };
type UploadState = { fileName: string; percent: number; phase: "uploading" | "processing" };

type DriveClientProps = {
  files: DriveClientFile[];
  folders: DriveFolder[];
  courses: Array<{ id: string; title: string }>;
  canManage?: boolean;
  parentId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
};

function uploadDriveFile(formData: FormData, onProgress: (percent: number) => void, onProcessing: () => void) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/drive");
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.upload.addEventListener("load", onProcessing);
    xhr.addEventListener("load", () => {
      const body = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(typeof body.error === "string" ? body.error : "上传失败"));
    });
    xhr.addEventListener("error", () => reject(new Error("网络连接中断，请重试上传")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));
    xhr.send(formData);
  });
}

export function DriveClient({ files, folders, courses, canManage = false, parentId, breadcrumbs }: DriveClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [visibleFiles, setVisibleFiles] = useState(files);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [attachTarget, setAttachTarget] = useState<DriveClientFile | null>(null);
  const [attachCourseId, setAttachCourseId] = useState("");
  const [moveTarget, setMoveTarget] = useState<DriveClientFile | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const parentBreadcrumb = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
  const upHref = parentBreadcrumb ? `/space/drive?parentId=${encodeURIComponent(parentBreadcrumb.id)}` : "/space/drive";

  useEffect(() => {
    setVisibleFiles(files);
  }, [files]);

  const folderPaths = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return new Map(folders.map((folder) => {
      const names = [folder.name];
      const seen = new Set([folder.id]);
      let current = folder;
      while (current.parentId) {
        const parent = byId.get(current.parentId);
        if (!parent || seen.has(parent.id)) break;
        seen.add(parent.id);
        names.unshift(parent.name);
        current = parent;
      }
      return [folder.id, names.join(" / ")];
    }));
  }, [folders]);

  const moveFolderOptions = useMemo(() => {
    if (!moveTarget) return folders;
    const excluded = new Set([moveTarget.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          changed = true;
        }
      }
    }
    return folders.filter((folder) => !excluded.has(folder.id));
  }, [folders, moveTarget]);

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

  async function run(actionKey: string, action: () => Promise<void>) {
    setPendingAction(actionKey);
    try {
      await action();
      router.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
    } finally {
      setPendingAction(null);
    }
  }

  async function createFolder(formData: FormData) {
    await run("create-folder", async () => {
      const body = await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), parentId }) }, "文件夹已创建，可以点击文件夹进入");
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
    });
  }

  async function upload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    setStatus(null);
    setUploadState({ fileName: file.name, percent: 0, phase: "uploading" });
    await run("upload", async () => {
      const body = await uploadDriveFile(
        formData,
        (percent) => setUploadState((current) => current ? { ...current, percent } : current),
        () => setUploadState((current) => current ? { ...current, percent: 100, phase: "processing" } : current)
      );
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
      setStatus(
        body?.storage === "oss"
          ? { tone: "success", text: `“${file.name}”已上传完成` }
          : { tone: "error", text: "文件已上传到本地存储，未写入 OSS。请检查服务器存储配置。" }
      );
      setSelectedFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
    setUploadState(null);
  }

  async function share(id: string) {
    await run(`share:${id}`, async () => { await request(`/api/drive/${id}/share`, { method: "POST" }, "分享码已生成"); });
  }

  async function attach() {
    if (!attachTarget || !attachCourseId) return;
    const course = courses.find((item) => item.id === attachCourseId);
    await run(`attach:${attachTarget.id}`, async () => {
      await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driveFileId: attachTarget.id, courseId: attachCourseId }) }, `已添加到《${course?.title ?? "所选课程"}》的课程资料`);
      setAttachTarget(null);
      setAttachCourseId("");
    });
  }

  async function rename(id: string, currentName: string) {
    const name = window.prompt("重命名", currentName);
    if (!name || name === currentName) return;
    await run(`rename:${id}`, async () => {
      await request(`/api/drive/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "已重命名");
      setVisibleFiles((current) => current.map((file) => file.id === id ? { ...file, name } : file));
    });
  }

  async function move() {
    if (!moveTarget) return;
    const nextParentId = moveParentId || null;
    if (nextParentId === (moveTarget.parentId ?? null)) {
      setMoveTarget(null);
      return;
    }
    const destination = nextParentId ? folderPaths.get(nextParentId) : "我的云盘";
    await run(`move:${moveTarget.id}`, async () => {
      await request(`/api/drive/${moveTarget.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: nextParentId }) }, `已移动到“${destination}”`);
      setVisibleFiles((current) => current.filter((file) => file.id !== moveTarget.id));
      setMoveTarget(null);
    });
  }

  async function remove(file: DriveClientFile) {
    const message = file.kind === "folder"
      ? `确定删除文件夹“${file.name}”及其中所有内容吗？其中的文件也会从 OSS 或本地存储中删除。`
      : `确定删除“${file.name}”吗？文件会从 OSS 或本地存储中删除，并从已关联的课程资料中移除。`;
    if (!window.confirm(message)) return;
    await run(`delete:${file.id}`, async () => {
      await request(`/api/drive/${file.id}`, { method: "DELETE" }, "文件及存储对象已删除");
      setVisibleFiles((current) => current.filter((item) => item.id !== file.id));
    });
  }

  const fileSummary = (file: DriveClientFile) => (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]">
        {file.kind === "folder" ? <Folder className="h-5 w-5" aria-hidden="true" /> : <FileIcon className="h-5 w-5" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-slate-900">{file.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{file.kind === "folder" ? "文件夹 · 点击进入" : formatBytes(file.size)}</span>
          {file.courseTitle ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{file.courseTitle}</span> : null}
          {file.copilotCourses?.length ? <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">Copilot：{file.copilotCourses.map((course) => course.title).join("、")}</span> : null}
          {canManage && file.shares?.[0] ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">分享码 {file.shares[0].code}</span> : null}
        </div>
      </div>
      {file.kind === "folder" ? <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" /> : null}
    </>
  );

  return (
    <div className="space-y-6">
      <nav aria-label="云盘路径" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        {parentId ? <><Link href={upHref} className="cx-focus-ring mr-1 inline-flex items-center gap-1.5 rounded-lg border border-[var(--cx-border)] bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-[var(--cx-blue)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />返回上一级</Link><span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" /></> : null}
        <Link href="/space/drive" className="cx-focus-ring rounded-lg px-2 py-1.5 font-medium text-slate-700 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">我的云盘</Link>
        {breadcrumbs.map((item) => <span key={item.id} className="flex items-center gap-1.5"><ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" /><Link href={`/space/drive?parentId=${encodeURIComponent(item.id)}`} className="cx-focus-ring rounded-lg px-2 py-1.5 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">{item.name}</Link></span>)}
      </nav>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form action={createFolder} className="rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><FolderPlus className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-slate-900">新建文件夹</h2><p className="mt-0.5 text-xs text-slate-500">创建后可点击文件夹进入并继续整理。</p></div></div>
            <label className="mt-4 block space-y-1.5"><span className="text-sm font-medium text-slate-700">文件夹名称</span><Input name="name" placeholder="例如：课程课件" required /></label>
            <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={pendingAction !== null}>{pendingAction === "create-folder" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FolderPlus className="h-4 w-4" aria-hidden="true" />}{pendingAction === "create-folder" ? "正在创建" : "创建文件夹"}</Button>
          </form>
          <form action={upload} className="rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]"><UploadCloud className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold text-slate-900">上传文件</h2><p className="mt-0.5 text-xs text-slate-500">上传期间会显示进度，完成前请保持页面打开。</p></div></div>
            <input type="hidden" name="parentId" value={parentId ?? ""} />
            <FilePicker ref={fileInputRef} id="drive-upload-file" name="file" className="mt-4" label="选择要上传的文件" hint="支持当前课程允许的文件格式" selectedFileName={selectedFileName} onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} />
            {uploadState ? (
              <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                <div className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="min-w-0 truncate font-medium">{uploadState.phase === "uploading" ? `正在上传“${uploadState.fileName}”` : `已传输完成，正在保存并解析“${uploadState.fileName}”`}</span><span className="ml-auto shrink-0 text-xs">{uploadState.percent}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-[var(--cx-blue)] transition-[width]" style={{ width: `${uploadState.percent}%` }} /></div>
              </div>
            ) : null}
            <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={pendingAction !== null || !selectedFileName}><UploadCloud className="h-4 w-4" aria-hidden="true" />{pendingAction === "upload" ? "正在上传" : "上传"}</Button>
          </form>
        </div>
      ) : null}

      {status ? <p role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${status.tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{status.text}</p> : null}

      <div className="space-y-3">
        {visibleFiles.map((file) => (
          <article key={file.id} className="rounded-2xl border border-[var(--cx-border)] bg-white p-4 shadow-sm sm:p-5">
            {file.kind === "folder" ? (
              <Link href={`/space/drive?parentId=${encodeURIComponent(file.id)}`} className="cx-focus-ring -m-1 flex min-w-0 items-start gap-3 rounded-xl p-1 transition hover:bg-slate-50">{fileSummary(file)}</Link>
            ) : <div className="flex min-w-0 items-start gap-3">{fileSummary(file)}</div>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {file.kind === "file" ? <a href={`/api/drive/${file.id}?download=1`} className="cx-focus-ring cx-tactile inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--cx-border-strong)] bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden="true" />下载</a> : null}
              {canManage ? (
                <>
                  <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => rename(file.id, file.name)}><Pencil className="h-4 w-4" aria-hidden="true" />重命名</Button>
                  {file.kind === "file" ? <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => share(file.id)}><Share2 className="h-4 w-4" aria-hidden="true" />分享</Button> : null}
                  <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => { setMoveTarget(file); setMoveParentId(file.parentId ?? ""); }}><Move className="h-4 w-4" aria-hidden="true" />移动</Button>
                  {file.kind === "file" && courses.length ? <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => { setAttachTarget(file); setAttachCourseId(courses.length === 1 ? courses[0].id : ""); }}>添加到课程资料</Button> : null}
                  <Button type="button" variant="danger" disabled={pendingAction !== null} onClick={() => remove(file)}><Trash2 className="h-4 w-4" aria-hidden="true" />{pendingAction === `delete:${file.id}` ? "删除中" : "删除"}</Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!visibleFiles.length ? <div className="rounded-2xl border border-dashed border-[var(--cx-border-strong)] bg-white p-8 text-center"><Folder className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">{canManage ? "这个文件夹还是空的" : "暂无已发布课程资料"}</p><p className="mt-1 text-xs text-slate-500">{canManage ? "在上方新建文件夹，或选择文件上传。" : "老师发布后，课程资料会显示在这里。"}</p></div> : null}
      </div>

      <Dialog open={Boolean(attachTarget)} title="添加到课程资料" onClose={() => { if (!pendingAction) setAttachTarget(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">选择要接收“{attachTarget?.name}”的课程。这里只创建课程资料入口，不复制文件；以后从云盘删除该文件，课程中的入口也会一并移除。</p>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">目标课程</span><Select aria-label="目标课程" value={attachCourseId} onChange={(event) => setAttachCourseId(event.target.value)}><option value="">请选择课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setAttachTarget(null)}>取消</Button><Button type="button" disabled={!attachCourseId || pendingAction !== null} onClick={() => void attach()}>{pendingAction?.startsWith("attach:") ? "正在添加" : "确认添加"}</Button></div>
        </div>
      </Dialog>

      <Dialog open={Boolean(moveTarget)} title={`移动${moveTarget?.kind === "folder" ? "文件夹" : "文件"}`} onClose={() => { if (!pendingAction) setMoveTarget(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">选择“{moveTarget?.name}”的新位置。</p>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">目标文件夹</span><Select aria-label="目标文件夹" value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)}><option value="">我的云盘</option>{moveFolderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folderPaths.get(folder.id)}</option>)}</Select></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setMoveTarget(null)}>取消</Button><Button type="button" disabled={pendingAction !== null || (moveParentId || null) === (moveTarget?.parentId ?? null)} onClick={() => void move()}>{pendingAction?.startsWith("move:") ? "正在移动" : "确认移动"}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
