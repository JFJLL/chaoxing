"use client";

import { useState } from "react";
import { FolderCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

export type CourseDriveRoot = { id: string; name: string };
export type CourseDriveRootCandidate = { id: string; name: string; path: string };

export function CourseDriveRootSetup({
  courseId,
  folders,
  onReady
}: {
  courseId: string;
  folders: CourseDriveRootCandidate[];
  onReady: (root: CourseDriveRoot) => void;
}) {
  const [showBind, setShowBind] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState<"create" | "bind" | null>(null);
  const [error, setError] = useState("");

  async function configure(action: "create" | "bind") {
    if (action === "bind" && !folderId) return;
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/drive-root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "create" ? { action } : { action, folderId })
      });
      const body = (await response.json().catch(() => null)) as { root?: CourseDriveRoot; error?: string } | null;
      if (!response.ok || !body?.root) throw new Error(body?.error || "课程云盘设置失败");
      onReady(body.root);
    } catch (configureError) {
      setError(configureError instanceof Error ? configureError.message : "课程云盘设置失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--cx-blue)] shadow-sm">
        <FolderCog className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">设置课程云盘文件夹</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
        为这门课程创建专属根文件夹，或绑定你云盘中已有的文件夹。学生不会看到完整云盘。
      </p>
      {showBind ? (
        <div className="mt-5 max-w-xl space-y-3 rounded-xl border border-indigo-100 bg-white p-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">已有文件夹</span>
            <Select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
              <option value="">请选择文件夹</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.path}</option>
              ))}
            </Select>
          </label>
          {!folders.length ? <p className="text-xs text-slate-500">你的云盘中还没有可绑定的文件夹，请先创建默认文件夹。</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void configure("bind")} disabled={!folderId || busy !== null}>
              {busy === "bind" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              确认绑定
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowBind(false)} disabled={busy !== null}>取消</Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void configure("create")} disabled={busy !== null}>
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy === "create" ? "创建中" : "创建默认文件夹"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowBind(true)} disabled={busy !== null}>
            绑定已有文件夹
          </Button>
        </div>
      )}
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
