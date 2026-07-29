"use client";

import { useEffect, useState } from "react";
import { CheckSquare2, Cloud, FileText, Loader2 } from "lucide-react";
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
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.path === "string";
}

export function CourseDocumentImportSources({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [root, setRoot] = useState<DriveRoot | null>();
  const [folders, setFolders] = useState<RootCandidate[]>([]);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
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
          error?: string;
        } | null;
        if (!response.ok) throw new Error(body?.error || "课程云盘加载失败");
        if (!cancelled) {
          setRoot(body?.root ?? null);
          setFolders(Array.isArray(body?.folders) ? body.folders : []);
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
    if (!root) {
      setItems([]);
      return;
    }
    let cancelled = false;

    async function loadDocuments() {
      setLoadingItems(true);
      try {
        const response = await fetch(`/api/courses/${courseId}/drive-picker?kind=document`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { items?: unknown; error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "云盘文档加载失败");
        if (!cancelled) {
          setItems(Array.isArray(body?.items) ? body.items.filter(isPickerItem) : []);
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
  }, [courseId, root]);

  function toggleItem(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
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
    return (
      <div className="space-y-3">
        {message ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{message.text}</p> : null}
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
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <CheckSquare2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">从课程云盘选择</h2>
            <p className="mt-1 text-sm text-slate-500">可多选当前课程根文件夹及其子文件夹中的可解析文档；文件不会被复制。</p>
          </div>
        </div>
        {loadingItems ? (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在读取云盘文档
          </p>
        ) : items.length ? (
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
            {items.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-3 transition hover:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleItem(item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <FileText className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{item.name}</span>
                    <span className="block truncate text-xs text-slate-500">{item.path}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            课程云盘中还没有可导入的文档
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!selectedIds.length || submitting} onClick={() => void importSelected()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? "正在创建任务" : `导入所选文档${selectedIds.length ? `（${selectedIds.length}）` : ""}`}
          </Button>
          {selectedIds.length ? <span className="text-xs text-slate-500">已选择 {selectedIds.length} 个文档</span> : null}
        </div>
      </section>

      <UploadPanel courseId={courseId} />

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
