"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckSquare2, Cloud, FileText, Folder, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { UploadPanel } from "@/components/ai-import/UploadPanel";
import { CourseDriveRootSetup } from "@/components/course-workspace/CourseDriveRootSetup";
import { Button } from "@/components/ui/Button";

type DriveRoot = { id: string; name: string };
type RootCandidate = { id: string; name: string; path: string };
type PickerItem = {
  id: string;
  name: string;
  path: string;
  kind: string;
  mimeType: string | null;
  parentId: string | null;
};

function isPickerItem(value: unknown): value is PickerItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PickerItem>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.path === "string" && typeof item.kind === "string";
}

/**
 * The course drive document list is only requested after the picker opens for
 * the first time, and never re-requested while this page remains mounted.
 */
export function shouldLoadDrivePickerDocuments(hasRoot: boolean, expanded: boolean, loaded: boolean) {
  return hasRoot && expanded && !loaded;
}

export function CourseDocumentImportSources({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [root, setRoot] = useState<DriveRoot | null>();
  const [folders, setFolders] = useState<RootCandidate[]>([]);
  const [canBindRoot, setCanBindRoot] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [drivePickerExpanded, setDrivePickerExpanded] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      try {
        const response = await fetch(`/api/courses/${courseId}/drive-root`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as {
          root?: DriveRoot | null;
          folders?: RootCandidate[];
          canBindRoot?: boolean;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(body?.error || "课程云盘加载失败");
        if (!cancelled) {
          setRoot(body?.root ?? null);
          setFolders(Array.isArray(body?.folders) ? body.folders : []);
          setCanBindRoot(body?.canBindRoot === true);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({ tone: "error", text: error instanceof Error ? error.message : "课程云盘加载失败" });
          setRoot(null);
        }
      }
    }

    void loadRoot();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (!shouldLoadDrivePickerDocuments(Boolean(root), drivePickerExpanded, documentsLoaded)) return;
    let cancelled = false;

    async function loadDocuments() {
      setLoadingItems(true);
      try {
        const response = await fetch(`/api/courses/${courseId}/drive-picker`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { items?: unknown; error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "云盘文档加载失败");
        if (!cancelled) {
          setItems(Array.isArray(body?.items) ? body.items.filter(isPickerItem) : []);
          setDocumentsLoaded(true);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) setMessage({ tone: "error", text: error instanceof Error ? error.message : "云盘文档加载失败" });
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }

    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [courseId, root, drivePickerExpanded, documentsLoaded]);

  const activeFolder = useMemo(() => {
    if (!root || activeFolderId === root.id) return null;
    return items.find((item) => item.id === activeFolderId && item.kind === "folder") ?? null;
  }, [activeFolderId, items, root]);
  const visibleItems = useMemo(() => {
    if (!root) return [];
    const parentId = activeFolderId ?? root.id;
    return items
      .filter((item) => item.parentId === parentId)
      .sort((left, right) => {
        if (left.kind === "folder" && right.kind !== "folder") return -1;
        if (left.kind !== "folder" && right.kind === "folder") return 1;
        return left.name.localeCompare(right.name, "zh-CN");
      });
  }, [activeFolderId, items, root]);

  function openDrivePicker() {
    if (!root) return;
    setActiveFolderId(root.id);
    setDrivePickerExpanded(true);
    setMessage(null);
  }

  function closeDrivePicker() {
    if (!submitting) setDrivePickerExpanded(false);
  }

  function toggleItem(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  }

  function goToParentFolder() {
    if (!root || !activeFolder || !activeFolder.parentId) {
      setActiveFolderId(root?.id ?? null);
      return;
    }
    setActiveFolderId(activeFolder.parentId);
  }

  async function importSelected() {
    if (!selectedIds.length) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-import/from-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileIds: selectedIds })
      });
      const body = (await response.json().catch(() => null)) as {
        jobs?: Array<{ id: string }>;
        jobIds?: string[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "云盘文档导入失败");
      const jobIds = Array.isArray(body?.jobIds)
        ? body.jobIds
        : Array.isArray(body?.jobs)
          ? body.jobs.map((job) => job.id)
          : [];
      if (!jobIds.length) throw new Error("未创建导入任务");
      setSelectedIds([]);
      setDrivePickerExpanded(false);
      router.push(`/space/courses/${courseId}/ai-import/${jobIds[0]}#outline-review`);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "云盘文档导入失败" });
    } finally {
      setSubmitting(false);
    }
  }

  if (root === undefined) {
    return <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在读取课程云盘</p>;
  }

  if (!root) {
    if (message?.tone === "error") {
      return <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{message.text}</p>;
    }
    if (!canBindRoot) {
      return (
        <p role="status" className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-5 text-sm text-amber-800">
          课程云盘尚未绑定，请联系课程所有者完成根目录设置后再导入资料。
        </p>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">导入前需要先设置当前课程的云盘根文件夹。</p>
        <CourseDriveRootSetup courseId={courseId} folders={folders} onReady={setRoot} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-emerald-800">
          <Cloud className="h-4 w-4" aria-hidden="true" />
          当前课程云盘：<strong>{root.name}</strong>
        </span>
        <a href={`/space/courses/${courseId}/drive`} className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline">
          打开课程云盘
        </a>
      </div>

      <section className="rounded-2xl border border-[var(--cx-border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDF3F0] text-[#A8402F]">
              <CheckSquare2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="block">
              <span className="block font-semibold text-slate-900">从课程云盘选择</span>
              <span className="mt-1 block text-sm text-slate-500">
                {selectedIds.length ? `已选择 ${selectedIds.length} 个文档` : "点击后浏览课程云盘中的各级文件夹和文档"}
              </span>
            </span>
          </span>
          <Button type="button" onClick={openDrivePicker}>
            <Folder className="h-4 w-4" />
            选择云盘文件
          </Button>
        </div>
        {selectedIds.length ? <p className="mt-4 rounded-xl bg-[#FFF5F2] px-3 py-2 text-sm text-[#8E3425]">已选择 {selectedIds.length} 个文档，打开选择器可继续调整。</p> : null}
      </section>

      <UploadPanel courseId={courseId} />

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {message.text}
        </p>
      ) : null}

      {drivePickerExpanded ? (
        <div role="dialog" aria-modal="true" aria-labelledby="course-drive-picker-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <section className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="course-drive-picker-title" className="text-lg font-semibold text-slate-900">选择课程云盘文件</h2>
                <p className="mt-1 text-sm text-slate-500">打开文件夹继续浏览；勾选后可一次导入多个课程文档。</p>
              </div>
              <button type="button" aria-label="关闭课程云盘选择" disabled={submitting} onClick={closeDrivePicker} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-6 py-3">
              <div className="min-w-0"><p className="text-xs text-slate-400">当前位置</p><p className="truncate text-sm font-medium text-slate-700">{activeFolder ? activeFolder.path : root.name}</p></div>
              <Button type="button" variant="secondary" disabled={!activeFolder || submitting} onClick={goToParentFolder}>
                <ArrowLeft className="h-4 w-4" />
                上一级
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {loadingItems ? (
                <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-12 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在读取课程云盘</p>
              ) : visibleItems.length ? (
                <div className="space-y-2">{visibleItems.map((item) => {
                  if (item.kind === "folder") {
                    return <button key={item.id} type="button" disabled={submitting} onClick={() => setActiveFolderId(item.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-left transition hover:border-[#F0C8BE] hover:bg-[#FFF9F7] disabled:opacity-60"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Folder className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{item.name}</span><span className="mt-0.5 block truncate text-xs text-slate-400">文件夹 · 点击浏览</span></span><span className="text-xs font-medium text-[#A8402F]">打开</span></button>;
                  }
                  const selected = selectedIds.includes(item.id);
                  return <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${selected ? "border-[#D07865] bg-[#FFF5F2]" : "border-slate-100 bg-white hover:border-[#F0C8BE] hover:bg-slate-50"}`}><input type="checkbox" checked={selected} disabled={submitting} onChange={() => toggleItem(item.id)} className="h-4 w-4 rounded border-slate-300 text-[#A8402F] focus:ring-[#D07865]" /><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FDF3F0] text-[#BC5B47]"><FileText className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{item.name}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{item.mimeType || "课程文档"}</span></span></label>;
                })}</div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">当前文件夹中没有可选择的课程文档。</p>
              )}
              {message?.tone === "error" ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message.text}</p> : null}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4"><p className="text-sm text-slate-500">已选择 {selectedIds.length} 个文档</p><div className="flex items-center gap-3"><Button type="button" variant="secondary" disabled={submitting} onClick={closeDrivePicker}>取消</Button><Button type="button" disabled={!selectedIds.length || submitting} onClick={() => void importSelected()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckSquare2 className="h-4 w-4" />}{submitting ? "正在创建任务" : `导入所选文档${selectedIds.length ? `（${selectedIds.length}）` : ""}`}</Button></div></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
