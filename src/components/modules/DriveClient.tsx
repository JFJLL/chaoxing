"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Download, Eye, EyeOff, File as FileIcon, Folder, FolderPlus, LoaderCircle, MoreHorizontal, Move, Pencil, Share2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
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
type UploadState = { label: string; percent: number; phase: "uploading" | "processing" };
type UploadSelection =
  | { kind: "files"; files: File[] }
  | { kind: "folder"; files: File[]; folderName: string };

export function driveMutationBasePath(courseId?: string) {
  return courseId ? `/api/courses/${courseId}/drive` : "/api/drive";
}

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
          className={`cx-focus-ring shrink-0 rounded-md px-2 py-1 font-medium ${currentParentId === rootParentId ? "bg-[#F9ECE7] text-[#6F281D]" : "text-slate-600 hover:bg-white hover:text-[#8E3425]"}`}
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
              className={`cx-focus-ring rounded-md px-2 py-1 ${folder.id === currentParentId ? "bg-[#F9ECE7] font-medium text-[#6F281D]" : "text-slate-600 hover:bg-white hover:text-[#8E3425]"}`}
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
            className="cx-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-[#FDF3F0] hover:text-[#6F281D]"
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

function uploadDriveFile(url: string, formData: FormData, onProgress: (percent: number) => void, onProcessing: () => void) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.upload.addEventListener("load", onProcessing);
    xhr.addEventListener("load", () => {
      const body = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else {
        const message = typeof body.error === "string" ? body.error : "上传失败";
        const failedNames = Array.isArray(body.failed)
          ? body.failed.slice(0, 3).map((item: { name?: string }) => item.name).filter(Boolean).join("、")
          : "";
        reject(new Error(failedNames ? `${message}：${failedNames}${body.failed.length > 3 ? "…" : ""}` : message));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("网络连接中断，请重试上传")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));
    xhr.send(formData);
  });
}

const driveMenuItemClassName =
  "cx-focus-ring flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

function DriveItemActionsMenu({
  file,
  folderHref,
  canManage,
  courseId,
  coursesLength,
  pendingAction,
  onRename,
  onShare,
  onStudentAccess,
  onMove,
  onAttach,
  onRemove
}: {
  file: DriveClientFile;
  folderHref: string;
  canManage: boolean;
  courseId?: string;
  coursesLength: number;
  pendingAction: string | null;
  onRename: () => void;
  onShare: () => void;
  onStudentAccess: () => void;
  onMove: () => void;
  onAttach: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const disabled = pendingAction !== null;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`更多操作：${file.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="cx-focus-ring cx-tactile inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`${file.name}的操作`}
          className="absolute right-0 top-12 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--cx-border)] bg-white p-2 shadow-floating"
        >
          {file.kind === "folder" ? (
            <Link href={folderHref} role="menuitem" onClick={() => setOpen(false)} className={driveMenuItemClassName}>
              <Folder className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              打开文件夹
            </Link>
          ) : (
            <>
              <a href={`${driveMutationBasePath(courseId)}/${file.id}?preview=1`} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(false)} className={driveMenuItemClassName}>
                <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                预览
              </a>
              <a href={`${driveMutationBasePath(courseId)}/${file.id}?download=1`} role="menuitem" onClick={() => setOpen(false)} className={driveMenuItemClassName}>
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                下载
              </a>
            </>
          )}
          {canManage ? (
            <>
              <button type="button" role="menuitem" disabled={disabled} onClick={() => runAction(onRename)} className={driveMenuItemClassName}>
                <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                重命名
              </button>
              {file.kind === "file" && !courseId ? (
                <button type="button" role="menuitem" disabled={disabled} onClick={() => runAction(onShare)} className={driveMenuItemClassName}>
                  <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  分享
                </button>
              ) : null}
              {courseId && file.studentAccess ? (
                <button type="button" role="menuitem" disabled={disabled} onClick={() => runAction(onStudentAccess)} className={driveMenuItemClassName}>
                  {file.studentAccess === "ALLOW" ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {file.studentAccess === "ALLOW" ? "禁止学生查看与 AI 引用" : "允许学生查看与 AI 引用"}
                </button>
              ) : null}
              <button type="button" role="menuitem" disabled={disabled} onClick={() => runAction(onMove)} className={driveMenuItemClassName}>
                <Move className="h-4 w-4 shrink-0" aria-hidden="true" />
                移动
              </button>
              {file.kind === "file" && !courseId && coursesLength ? (
                <button type="button" role="menuitem" disabled={disabled} onClick={() => runAction(onAttach)} className={driveMenuItemClassName}>
                  <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  添加到课程资料
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => runAction(onRemove)}
                className={`${driveMenuItemClassName} text-red-600 hover:bg-red-50 hover:text-red-700`}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pendingAction === `delete:${file.id}` ? "删除中" : "删除"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
  const [visibleFiles, setVisibleFiles] = useState(files);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [uploadSelection, setUploadSelection] = useState<UploadSelection | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<DriveClientFile | null>(null);
  const [attachCourseId, setAttachCourseId] = useState("");
  const [moveTarget, setMoveTarget] = useState<DriveClientFile | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const parentBreadcrumb = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
  const browsingRoot = parentId === rootParentId;
  const mutationBasePath = driveMutationBasePath(courseId);
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
      const body = await request(mutationBasePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), parentId }) }, "文件夹已创建，可以点击文件夹进入");
      if (body?.file) setVisibleFiles((current) => [body.file, ...current]);
    });
    if (succeeded) setCreateDialogOpen(false);
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setUploadSelection(files.length ? { kind: "files", files } : null);
    event.target.value = "";
  }

  function handleFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) {
      setUploadSelection(null);
      setStatus({ tone: "error", text: "所选文件夹为空，请重新选择" });
      return;
    }
    const firstPath = files[0]?.webkitRelativePath ?? "";
    if (!firstPath) {
      setUploadSelection(null);
      setStatus({ tone: "error", text: "当前浏览器不支持上传文件夹，请改用“上传文件”多选上传" });
      return;
    }
    const folderName = firstPath.split("/")[0] ?? "";
    setUploadSelection(files.length ? { kind: "folder", files, folderName } : null);
  }

  async function upload() {
    if (!uploadSelection || !uploadSelection.files.length) return;
    const count = uploadSelection.files.length;
    const label = uploadSelection.kind === "folder"
      ? `文件夹“${uploadSelection.folderName}”（${count} 个文件）`
      : `${count} 个文件`;
    const formData = new FormData();
    formData.set("parentId", parentId ?? "");
    if (uploadSelection.kind === "folder") {
      formData.set("folderName", uploadSelection.folderName);
      for (const file of uploadSelection.files) {
        formData.append("files", file);
        formData.append("paths", file.webkitRelativePath?.split("/").slice(1).join("/") || file.name);
      }
    } else {
      for (const file of uploadSelection.files) formData.append("files", file);
    }
    setStatus(null);
    setUploadState({ label: `正在上传“${label}”`, percent: 0, phase: "uploading" });
    const succeeded = await run("upload", async () => {
      const body = await uploadDriveFile(
        mutationBasePath,
        formData,
        (percent) => setUploadState((current) => current ? { ...current, percent } : current),
        () => setUploadState((current) => current ? { ...current, percent: 100, phase: "processing" } : current)
      );
      const files = Array.isArray(body?.files) ? body.files : [];
      const folder = body?.folder;
      if (folder) setVisibleFiles((current) => [folder, ...current.filter((item) => item.id !== folder.id)]);
      if (files.length) {
        const knownIds = new Set(files.map((item: DriveClientFile) => item.id));
        setVisibleFiles((current) => [...files, ...current.filter((item) => !knownIds.has(item.id))]);
      }
      const failed = Array.isArray(body?.failed) ? body.failed : [];
      const failedText = failed.length
        ? `，${failed.length} 个上传失败：${failed.slice(0, 3).map((item: { name: string }) => item.name).join("、")}${failed.length > 3 ? "…" : ""}`
        : "";
      setStatus(
        body?.storage === "oss"
          ? { tone: failed.length ? "error" : "success", text: `“${label}”已上传${failedText}` }
          : { tone: "error", text: "文件已上传到本地存储，未写入 OSS。请检查服务器存储配置。" }
      );
      setUploadSelection(null);
    });
    setUploadState(null);
    if (succeeded) setUploadDialogOpen(false);
  }

  function closeUploadDialog() {
    if (pendingAction) return;
    setUploadDialogOpen(false);
    setUploadSelection(null);
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
      await request(`${mutationBasePath}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "已重命名");
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
      await request(`${mutationBasePath}/${moveTarget.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: nextParentId }) }, `已移动到“${destination}”`);
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
      await request(`${mutationBasePath}/${file.id}`, { method: "DELETE" }, "文件及存储对象已删除");
      setVisibleFiles((current) => current.filter((item) => item.id !== file.id));
    });
  }

  const fileSummary = (file: DriveClientFile) => (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]">
        {file.kind === "folder" ? <Folder className="h-5 w-5" aria-hidden="true" /> : <FileIcon className="h-5 w-5" aria-hidden="true" />}
      </span>
      <h2 className="min-w-0 flex-1 truncate font-semibold text-slate-900" title={file.name}>{file.name}</h2>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleFiles.map((file) => (
          <article key={file.id} className="relative flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--cx-border)] bg-white p-3 shadow-sm transition hover:border-[#F0C8BE] hover:shadow-md sm:p-4">
            {file.kind === "folder" ? (
              <Link href={folderHref(file.id)} className="cx-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-slate-50">{fileSummary(file)}</Link>
            ) : <div className="flex min-w-0 flex-1 items-center gap-3 p-1">{fileSummary(file)}</div>}
            <DriveItemActionsMenu
              file={file}
              folderHref={folderHref(file.id)}
              canManage={canManage}
              courseId={courseId}
              coursesLength={courses.length}
              pendingAction={pendingAction}
              onRename={() => void rename(file.id, file.name)}
              onShare={() => void share(file.id)}
              onStudentAccess={() => void setStudentAccess(file)}
              onMove={() => { setMoveTarget(file); setMoveParentId(file.parentId === rootParentId ? "" : file.parentId ?? ""); }}
              onAttach={() => { setAttachTarget(file); setAttachCourseId(courses.length === 1 ? courses[0].id : ""); }}
              onRemove={() => void remove(file)}
            />
          </article>
        ))}
        {!visibleFiles.length ? <div className="rounded-2xl border border-dashed border-[var(--cx-border-strong)] bg-white p-8 text-center sm:col-span-2"><Folder className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">{canManage ? "这个文件夹还是空的" : "暂无已发布课程资料"}</p><p className="mt-1 text-xs text-slate-500">{canManage ? "在上方新建文件夹，或选择文件上传。" : "老师发布后，课程资料会显示在这里。"}</p></div> : null}
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

      <Dialog open={uploadDialogOpen} title="上传文件" onClose={closeUploadDialog}>
        <form onSubmit={(event) => { event.preventDefault(); void upload(); }} className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">可一次选择多个文件，或选择整个文件夹（保留子文件夹结构，同名文件夹会自动重命名）。上传完成前请保持页面打开。</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="cx-tactile flex min-h-16 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--cx-border-strong)] bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#E5A597] hover:bg-[var(--cx-blue-soft)]">
              <input type="file" multiple className="sr-only" onChange={handleFilesChange} disabled={pendingAction !== null} />
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              上传文件
            </label>
            <label className="cx-tactile flex min-h-16 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--cx-border-strong)] bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#E5A597] hover:bg-[var(--cx-blue-soft)]">
              <input type="file" {...({ webkitdirectory: "" } as any)} className="sr-only" onChange={handleFolderChange} disabled={pendingAction !== null} />
              <Folder className="h-4 w-4" aria-hidden="true" />
              上传文件夹
            </label>
          </div>
          {uploadSelection ? (
            <div className="rounded-xl border border-[#F9ECE7] bg-[#FDF3F0] px-3 py-3 text-sm text-[#522017]">
              <p className="font-medium">
                {uploadSelection.kind === "folder"
                  ? `已选择文件夹“${uploadSelection.folderName}”，共 ${uploadSelection.files.length} 个文件`
                  : `已选择 ${uploadSelection.files.length} 个文件`}
              </p>
              <p className="mt-1 line-clamp-2 break-all text-xs text-[#8E3425]">
                {uploadSelection.files.slice(0, 8).map((file) => file.name).join("、")}
                {uploadSelection.files.length > 8 ? ` 等 ${uploadSelection.files.length} 个文件` : ""}
              </p>
            </div>
          ) : null}
          {uploadState ? (
            <div role="status" aria-live="polite" className="rounded-xl border border-[#F9ECE7] bg-[#FDF3F0] px-3 py-3 text-sm text-[#6F281D]">
              <div className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="min-w-0 truncate font-medium">{uploadState.phase === "uploading" ? uploadState.label : "已传输完成，正在保存文件"}</span><span className="ml-auto shrink-0 text-xs">{uploadState.percent}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F9ECE7]"><div className="h-full rounded-full bg-[var(--cx-blue)] transition-[width]" style={{ width: `${uploadState.percent}%` }} /></div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={closeUploadDialog}>取消</Button>
            <Button type="submit" disabled={pendingAction !== null || !uploadSelection}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {pendingAction === "upload" ? "正在上传" : "开始上传"}
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
