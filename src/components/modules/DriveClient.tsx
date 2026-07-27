"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Download, Eye, EyeOff, File as FileIcon, Folder, FolderPlus, LoaderCircle, Move, Pencil, Share2, Trash2, UploadCloud } from "lucide-react";
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
  studentAccess?: "ALLOW" | "DENY";
  courseTitle?: string;
  shares?: Array<{ code: string }>;
  copilotCourses?: Array<{ id: string; title: string }>;
};

type DriveFolder = { id: string; name: string; parentId: string | null };
type UploadState = { fileName: string; percent: number; phase: "uploading" | "processing" };

export function MoveDestinationBrowser({
  folders,
  rootParentId,
  rootLabel,
  currentParentId,
  onNavigate,
  disabled = false
}: {
  folders: DriveFolder[];
  rootParentId: string | null;
  rootLabel: string;
  currentParentId: string | null;
  onNavigate: (folderId: string | null) => void;
  disabled?: boolean;
}) {
  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const breadcrumbs = useMemo(() => {
    const path: DriveFolder[] = [];
    const seen = new Set<string>();
    let current = currentParentId ? byId.get(currentParentId) : undefined;
    while (current && current.id !== rootParentId && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  }, [byId, currentParentId, rootParentId]);
  const children = useMemo(
    () => folders
      .filter((folder) => folder.id !== rootParentId && folder.parentId === currentParentId)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN")),
    [currentParentId, folders, rootParentId]
  );
  const parentDestination = breadcrumbs.length > 1
    ? breadcrumbs[breadcrumbs.length - 2].id
    : rootParentId;

  return (
    <section aria-label="选择目标文件夹" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <nav aria-label="目标文件夹路径" className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onNavigate(rootParentId)}
          className={`cx-focus-ring shrink-0 rounded-md px-2 py-1 font-medium ${currentParentId === rootParentId ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-white hover:text-blue-700"}`}
        >
          {rootLabel}
        </button>
        {breadcrumbs.map((folder) => (
          <span key={folder.id} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(folder.id)}
              className={`cx-focus-ring rounded-md px-2 py-1 ${folder.id === currentParentId ? "bg-blue-100 font-medium text-blue-800" : "text-slate-600 hover:bg-white hover:text-blue-700"}`}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </nav>
      <div role="list" aria-label="当前文件夹中的子文件夹" className="max-h-64 space-y-1 overflow-y-auto p-2">
        {breadcrumbs.length ? (
          <button
            type="button"
            role="listitem"
            disabled={disabled}
            onClick={() => onNavigate(parentDestination)}
            className="cx-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">上一级</span>
          </button>
        ) : null}
        {children.map((folder) => (
          <button
            key={folder.id}
            type="button"
            role="listitem"
            disabled={disabled}
            onClick={() => onNavigate(folder.id)}
            className="cx-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-800"
            aria-label={`打开文件夹 ${folder.name}`}
          >
            <Folder className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
          </button>
        ))}
        {!children.length ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400">此处没有子文件夹</p>
        ) : null}
      </div>
    </section>
  );
}

type DriveClientProps = {
  files: DriveClientFile[];
  folders: DriveFolder[];
  courses: Array<{ id: string; title: string }>;
  canManage?: boolean;
  courseId?: string;
  onRefresh?: () => Promise<void>;
  parentId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  baseHref?: string;
  rootParentId?: string | null;
  rootLabel?: string;
};

export async function refreshDriveAfterMutation(
  onRefresh: (() => Promise<void>) | undefined,
  refreshRoute: () => void
) {
  if (onRefresh) await onRefresh();
  else refreshRoute();
}

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

export function DriveClient({
  files,
  folders,
  courses,
  canManage = false,
  courseId,
  onRefresh,
  parentId,
  breadcrumbs,
  baseHref = "/space/drive",
  rootParentId = null,
  rootLabel = "我的云盘"
}: DriveClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [visibleFiles, setVisibleFiles] = useState(files);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<DriveClientFile | null>(null);
  const [attachCourseId, setAttachCourseId] = useState("");
  const [moveTarget, setMoveTarget] = useState<DriveClientFile | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const parentBreadcrumb = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
  const browsingRoot = parentId === rootParentId;
  const folderHref = (folderId: string) => `${baseHref}?parentId=${encodeURIComponent(folderId)}`;
  const upHref = parentBreadcrumb ? folderHref(parentBreadcrumb.id) : baseHref;

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
      await refreshDriveAfterMutation(onRefresh, () => router.refresh());
      return true;
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function createFolder(formData: FormData) {
    const succeeded = await run("create-folder", async () => {
      const body = await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), parentId }) }, "文件夹已创建，可以点击文件夹进入");
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
    });
    if (succeeded) setCreateDialogOpen(false);
  }

  async function upload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    setStatus(null);
    setUploadState({ fileName: file.name, percent: 0, phase: "uploading" });
    const succeeded = await run("upload", async () => {
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
    if (succeeded) setUploadDialogOpen(false);
  }

  async function share(id: string) {
    await run(`share:${id}`, async () => { await request(`/api/drive/${id}/share`, { method: "POST" }, "分享码已生成"); });
  }

  async function setStudentAccess(file: DriveClientFile) {
    if (!courseId || !file.studentAccess) return;
    const nextAccess = file.studentAccess === "ALLOW" ? "DENY" : "ALLOW";
    await run(`access:${file.id}`, async () => {
      await request(
        `/api/courses/${courseId}/drive/access/${file.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: nextAccess })
        },
        nextAccess === "ALLOW"
          ? "学生现在可以查看、下载并让 AI 引用"
          : "学生现在不可查看、下载，AI 也不可引用"
      );
    });
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
    const nextParentId = moveParentId || rootParentId;
    if (nextParentId === (moveTarget.parentId ?? null)) {
      setMoveTarget(null);
      return;
    }
    const destination = nextParentId === rootParentId ? rootLabel : nextParentId ? folderPaths.get(nextParentId) : rootLabel;
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
        {!browsingRoot ? <><Link href={upHref} className="cx-focus-ring mr-1 inline-flex items-center gap-1.5 rounded-lg border border-[var(--cx-border)] bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-[var(--cx-blue)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />返回上一级</Link><span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" /></> : null}
        <Link href={baseHref} className="cx-focus-ring rounded-lg px-2 py-1.5 font-medium text-slate-700 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">{rootLabel}</Link>
        {breadcrumbs.filter((item) => item.id !== rootParentId).map((item) => <span key={item.id} className="flex items-center gap-1.5"><ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" /><Link href={folderHref(item.id)} className="cx-focus-ring rounded-lg px-2 py-1.5 transition hover:bg-[var(--cx-blue-soft)] hover:text-[var(--cx-blue)]">{item.name}</Link></span>)}
      </nav>

      {canManage ? (
        <div className="flex flex-wrap gap-3 rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4">
          <Button type="button" onClick={() => setCreateDialogOpen(true)} disabled={pendingAction !== null}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            新建文件夹
          </Button>
          <Button type="button" variant="secondary" onClick={() => setUploadDialogOpen(true)} disabled={pendingAction !== null}>
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            上传文件
          </Button>
          <p className="basis-full text-xs text-slate-500 sm:basis-auto sm:self-center">选择操作后再填写内容，文件列表保持紧凑可见。</p>
        </div>
      ) : null}

      {status ? <p role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${status.tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{status.text}</p> : null}

      <div className="space-y-3">
        {visibleFiles.map((file) => (
          <article key={file.id} className="rounded-2xl border border-[var(--cx-border)] bg-white p-4 shadow-sm sm:p-5">
            {file.kind === "folder" ? (
              <Link href={folderHref(file.id)} className="cx-focus-ring -m-1 flex min-w-0 items-start gap-3 rounded-xl p-1 transition hover:bg-slate-50">{fileSummary(file)}</Link>
            ) : <div className="flex min-w-0 items-start gap-3">{fileSummary(file)}</div>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {file.kind === "file" ? <a href={`/api/drive/${file.id}?download=1`} className="cx-focus-ring cx-tactile inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--cx-border-strong)] bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden="true" />下载</a> : null}
              {canManage ? (
                <>
                  <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => rename(file.id, file.name)}><Pencil className="h-4 w-4" aria-hidden="true" />重命名</Button>
                  {file.kind === "file" ? <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => share(file.id)}><Share2 className="h-4 w-4" aria-hidden="true" />分享</Button> : null}
                  {courseId && file.studentAccess ? (
                    <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => void setStudentAccess(file)}>
                      {file.studentAccess === "ALLOW" ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                      {file.studentAccess === "ALLOW"
                        ? "学生可查看/下载 · AI 可引用"
                        : "学生不可查看/下载 · AI 不可引用"}
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => { setMoveTarget(file); setMoveParentId(file.parentId === rootParentId ? "" : file.parentId ?? ""); }}><Move className="h-4 w-4" aria-hidden="true" />移动</Button>
                  {file.kind === "file" && courses.length ? <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => { setAttachTarget(file); setAttachCourseId(courses.length === 1 ? courses[0].id : ""); }}>添加到课程资料</Button> : null}
                  <Button type="button" variant="danger" disabled={pendingAction !== null} onClick={() => remove(file)}><Trash2 className="h-4 w-4" aria-hidden="true" />{pendingAction === `delete:${file.id}` ? "删除中" : "删除"}</Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!visibleFiles.length ? <div className="rounded-2xl border border-dashed border-[var(--cx-border-strong)] bg-white p-8 text-center"><Folder className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">{canManage ? "这个文件夹还是空的" : "暂无已发布课程资料"}</p><p className="mt-1 text-xs text-slate-500">{canManage ? "在上方新建文件夹，或选择文件上传。" : "老师发布后，课程资料会显示在这里。"}</p></div> : null}
      </div>

      <Dialog open={createDialogOpen} title="新建文件夹" onClose={() => { if (!pendingAction) setCreateDialogOpen(false); }}>
        <form action={createFolder} className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">在当前路径下创建文件夹，完成后可进入文件夹继续整理资料。</p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">文件夹名称</span>
            <Input name="name" placeholder="例如：课程课件" required autoFocus />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setCreateDialogOpen(false)}>取消</Button>
            <Button type="submit" disabled={pendingAction !== null}>
              {pendingAction === "create-folder" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FolderPlus className="h-4 w-4" aria-hidden="true" />}
              {pendingAction === "create-folder" ? "正在创建" : "创建文件夹"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={uploadDialogOpen} title="上传文件" onClose={() => { if (!pendingAction) setUploadDialogOpen(false); }}>
        <form action={upload} className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">文件将上传到当前路径。上传完成前请保持页面打开。</p>
          <input type="hidden" name="parentId" value={parentId ?? ""} />
          <FilePicker ref={fileInputRef} id="drive-upload-file" name="file" label="选择要上传的文件" hint="支持当前课程允许的文件格式" selectedFileName={selectedFileName} onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} />
          {uploadState ? (
            <div role="status" aria-live="polite" className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
              <div className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="min-w-0 truncate font-medium">{uploadState.phase === "uploading" ? `正在上传“${uploadState.fileName}”` : `已传输完成，正在保存并解析“${uploadState.fileName}”`}</span><span className="ml-auto shrink-0 text-xs">{uploadState.percent}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-[var(--cx-blue)] transition-[width]" style={{ width: `${uploadState.percent}%` }} /></div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setUploadDialogOpen(false)}>取消</Button>
            <Button type="submit" disabled={pendingAction !== null || !selectedFileName}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {pendingAction === "upload" ? "正在上传" : "上传文件"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(attachTarget)} title="添加到课程资料" onClose={() => { if (!pendingAction) setAttachTarget(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">选择要接收“{attachTarget?.name}”的课程。系统会复制一份到该课程的资料文件夹并立即发布，原云盘文件之后移动或删除都不会影响课程资料。</p>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">目标课程</span><Select aria-label="目标课程" value={attachCourseId} onChange={(event) => setAttachCourseId(event.target.value)}><option value="">请选择课程</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setAttachTarget(null)}>取消</Button><Button type="button" disabled={!attachCourseId || pendingAction !== null} onClick={() => void attach()}>{pendingAction?.startsWith("attach:") ? "正在添加" : "确认添加"}</Button></div>
        </div>
      </Dialog>

      <Dialog open={Boolean(moveTarget)} title={`移动${moveTarget?.kind === "folder" ? "文件夹" : "文件"}`} panelClassName="max-w-xl" onClose={() => { if (!pendingAction) setMoveTarget(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">为“{moveTarget?.name}”逐层选择新位置，进入目标文件夹后点击“移动到此处”。</p>
          <MoveDestinationBrowser
            folders={moveFolderOptions}
            rootParentId={rootParentId}
            rootLabel={rootLabel}
            currentParentId={moveParentId || rootParentId}
            onNavigate={(folderId) => setMoveParentId(folderId === rootParentId ? "" : folderId ?? "")}
            disabled={pendingAction !== null}
          />
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            移动到：<span className="font-medium text-slate-900">{(moveParentId || rootParentId) === rootParentId ? rootLabel : folderPaths.get(moveParentId) ?? rootLabel}</span>
          </p>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => setMoveTarget(null)}>取消</Button><Button type="button" disabled={pendingAction !== null || (moveParentId || rootParentId) === (moveTarget?.parentId ?? null)} onClick={() => void move()}>{pendingAction?.startsWith("move:") ? "正在移动" : "移动到此处"}</Button></div>
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
