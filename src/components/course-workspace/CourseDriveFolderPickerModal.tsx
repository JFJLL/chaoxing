"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckSquare2, FileText, Folder, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type DriveRoot = { id: string; name: string };
export type DrivePickerItem = {
  id: string;
  name: string;
  path: string;
  kind: string;
  mimeType: string | null;
  parentId: string | null;
};

function isPickerItem(value: unknown): value is DrivePickerItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DrivePickerItem>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.path === "string" &&
    typeof item.kind === "string"
  );
}

export function CourseDriveFolderPickerModal({
  courseId,
  open,
  selectedIds,
  onClose,
  onConfirm
}: {
  courseId: string;
  open: boolean;
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (selectedIds: string[], selectedItems: DrivePickerItem[]) => void;
}) {
  const [root, setRoot] = useState<DriveRoot | null>(null);
  const [items, setItems] = useState<DrivePickerItem[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(selectedIds);
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [rootRes, pickerRes] = await Promise.all([
          fetch(`/api/courses/${courseId}/drive-root`, { cache: "no-store" }),
          fetch(`/api/courses/${courseId}/drive-picker`, { cache: "no-store" })
        ]);
        const rootBody = await rootRes.json().catch(() => null);
        const pickerBody = await pickerRes.json().catch(() => null);

        if (!rootRes.ok || !rootBody?.root) throw new Error(rootBody?.error || "课程云盘根目录加载失败");
        if (!pickerRes.ok) throw new Error(pickerBody?.error || "云盘文件列表加载失败");

        if (!cancelled) {
          const loadedRoot: DriveRoot = rootBody.root;
          const loadedItems: DrivePickerItem[] = Array.isArray(pickerBody?.items)
            ? pickerBody.items.filter(isPickerItem)
            : [];
          setRoot(loadedRoot);
          setItems(loadedItems);
          setActiveFolderId(loadedRoot.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载云盘文件失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [courseId, open, selectedIds]);

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

  function toggleItem(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    );
  }

  function goToParentFolder() {
    if (!root || !activeFolder || !activeFolder.parentId) {
      setActiveFolderId(root?.id ?? null);
      return;
    }
    setActiveFolderId(activeFolder.parentId);
  }

  function handleConfirm() {
    const selectedItems = items.filter((item) => selected.includes(item.id));
    onConfirm(selected, selectedItems);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-drive-picker-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
    >
      <section className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="notice-drive-picker-title" className="text-lg font-semibold text-slate-900">
              选择课程云盘文件
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              点击文件夹进入下一级目录，勾选文件即可添加到通知附件中。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭课程云盘选择"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Current Path Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-6 py-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">当前位置</p>
            <p className="truncate text-sm font-medium text-slate-700">
              {activeFolder ? activeFolder.path : root?.name || "课程云盘根目录"}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!activeFolder || activeFolder.id === root?.id}
            onClick={goToParentFolder}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            上一级
          </Button>
        </div>

        {/* File / Folder List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-12 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在读取课程云盘...
            </p>
          ) : error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          ) : visibleItems.length ? (
            <div className="space-y-2">
              {visibleItems.map((item) => {
                if (item.kind === "folder") {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveFolderId(item.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-left transition hover:border-[#F0C8BE] hover:bg-[#FFF9F7]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Folder className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {item.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          文件夹 · 点击浏览
                        </span>
                      </span>
                      <span className="text-xs font-medium text-[#A8402F]">打开</span>
                    </button>
                  );
                }
                const isChecked = selected.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${
                      isChecked
                        ? "border-[#D07865] bg-[#FFF5F2]"
                        : "border-slate-100 bg-white hover:border-[#F0C8BE] hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-[#A8402F] focus:ring-[#D07865]"
                    />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FDF3F0] text-[#BC5B47]">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-400">
                        {item.mimeType || "课程文件"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              当前文件夹中没有可选择的文件。
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <p className="text-sm text-slate-500">已选择 {selected.length} 个文件</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="button" onClick={handleConfirm}>
              <CheckSquare2 className="h-4 w-4 mr-1" />
              确定选择{selected.length ? `（${selected.length}）` : ""}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
