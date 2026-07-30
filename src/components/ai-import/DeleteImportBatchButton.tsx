"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteImportBatchButton({ courseId, batchId, applied }: { courseId: string; batchId: string; applied: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const message = applied
      ? "只删除本次导入记录，不影响已保存的课程目录，也不会删除云盘原文件。确认删除？"
      : "删除记录不会删除云盘原文件，也不会回滚已保存目录。确认删除整个批次记录？";
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-import/batches/${batchId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "删除失败");
        return;
      }
      router.refresh();
    } catch {
      setError("删除失败，请检查网络后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={busy} onClick={() => void remove()} className="text-xs font-medium text-red-600 disabled:text-slate-400">
        {busy ? "删除中" : "删除记录"}
      </button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
