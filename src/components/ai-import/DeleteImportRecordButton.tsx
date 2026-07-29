"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteImportRecordButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm("删除记录不会删除云盘原文件，也不会回滚已保存目录。确认删除？")) return;
    setBusy(true);
    const response = await fetch(`/api/ai-import/${jobId}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "删除失败");
      return;
    }
    router.refresh();
  }
  return <span className="flex flex-col items-end gap-1"><button type="button" disabled={busy} onClick={() => void remove()} className="text-xs font-medium text-red-600 disabled:text-slate-400">{busy ? "删除中" : "删除记录"}</button>{error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}</span>;
}
