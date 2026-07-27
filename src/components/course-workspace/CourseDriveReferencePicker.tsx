"use client";

import { useState } from "react";
import { FileText, Folder, Loader2, Paperclip, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type CourseDriveReferenceDto = {
  id: string | null;
  name: string;
  mimeType: string | null;
  referenceType: "FILE" | "FOLDER";
  available: boolean;
};

type PickerTarget = {
  id: string;
  name: string;
  path: string;
  kind: string;
  mimeType: string | null;
  contextSelectable: boolean;
  extractionError: string | null;
  referenceType: "FILE" | "FOLDER";
};

export function CourseDriveReferencePicker({
  courseId,
  selected,
  disabled,
  canUpload,
  onApply
}: {
  courseId: string;
  selected: CourseDriveReferenceDto[];
  disabled?: boolean;
  canUpload: boolean;
  onApply: (references: Array<{ driveFileId: string; referenceType: "FILE" | "FOLDER" }>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<PickerTarget[]>([]);
  const [pending, setPending] = useState<Array<{ driveFileId: string; referenceType: "FILE" | "FOLDER" }>>([]);
  const [busy, setBusy] = useState<"load" | "apply" | "upload" | null>(null);
  const [error, setError] = useState("");

  async function loadTargets(
    nextReferences = selected.flatMap((reference) => reference.id ? [{
      driveFileId: reference.id,
      referenceType: reference.referenceType
    }] : [])
  ) {
    setBusy("load");
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/copilot/files`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { files?: PickerTarget[]; error?: string } | null;
      if (!response.ok || !Array.isArray(body?.files)) throw new Error(body?.error || "课程资料加载失败");
      setTargets(body.files);
      setPending(nextReferences);
      return body.files;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "课程资料加载失败");
      return [];
    } finally {
      setBusy(null);
    }
  }

  async function showPicker() {
    setOpen(true);
    await loadTargets();
  }

  function toggle(target: PickerTarget) {
    setPending((current) => {
      const included = current.some((reference) => reference.driveFileId === target.id);
      return included
        ? current.filter((reference) => reference.driveFileId !== target.id)
        : [...current, { driveFileId: target.id, referenceType: target.referenceType }];
    });
  }

  async function apply() {
    setBusy("apply");
    setError("");
    try {
      if (await onApply(pending)) setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  async function upload(formData: FormData) {
    setBusy("upload");
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/copilot/files`, { method: "POST", body: formData });
      const body = await response.json().catch(() => null) as { file?: { id: string }; error?: string } | null;
      if (!response.ok || !body?.file?.id) throw new Error(body?.error || "上传失败");
      const files = await loadTargets(pending);
      const uploaded = files.find((file) => file.id === body.file?.id);
      if (uploaded) {
        setPending((current) => [
          ...current.filter((reference) => reference.driveFileId !== uploaded.id),
          { driveFileId: uploaded.id, referenceType: "FILE" }
        ]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => void showPicker()} disabled={disabled}>
        <Paperclip className="h-4 w-4" />
        @课程资料
      </Button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="选择课程资料" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <h2 className="font-semibold text-slate-900">@课程资料</h2>
                <p className="mt-1 text-xs text-slate-500">文件和文件夹会持续用于这个对话；文件夹内容会随云盘动态更新。</p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setOpen(false)} disabled={busy !== null}>
                <X className="h-5 w-5" />
              </button>
            </header>
            {canUpload ? (
              <form action={upload} className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <input name="file" type="file" required className="min-w-0 flex-1 text-sm text-slate-600" />
                <Button type="submit" variant="secondary" disabled={busy !== null}>
                  {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  上传到“对话上传”
                </Button>
              </form>
            ) : null}
            <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
              {busy === "load" ? (
                <p role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在读取课程资料
                </p>
              ) : targets.length ? targets.map((target) => {
                const checked = pending.some((reference) => reference.driveFileId === target.id);
                const Icon = target.referenceType === "FOLDER" ? Folder : FileText;
                return (
                  <label key={target.id} className={`flex items-center gap-3 rounded-xl border p-3 ${target.contextSelectable ? "cursor-pointer border-slate-100 hover:border-blue-200" : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"}`}>
                    <input type="checkbox" checked={checked} disabled={!target.contextSelectable} onChange={() => toggle(target)} />
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{target.path}</span>
                      <span className="text-xs text-slate-400">
                        {target.referenceType === "FOLDER" ? "动态引用文件夹中的可访问内容" : target.extractionError || "课程云盘文件"}
                      </span>
                    </span>
                    {target.referenceType === "FILE" ? (
                      <a href={`/api/drive/${target.id}?preview=1`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-xs font-medium text-blue-600">查看</a>
                    ) : null}
                  </label>
                );
              }) : (
                <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">当前没有可引用的课程资料。</p>
              )}
              {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy !== null}>取消</Button>
              <Button type="button" onClick={() => void apply()} disabled={busy !== null}>
                {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                应用引用
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
