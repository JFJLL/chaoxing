"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Network, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

type KnowledgeMapSummary = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ id: string; type: string }>;
};

export function ImportJobManager({
  courseId,
  jobId,
  status,
  map
}: {
  courseId: string;
  jobId: string;
  status: string;
  map: KnowledgeMapSummary | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function action(label: string, input: string, init?: RequestInit, after?: () => void) {
    setBusy(label);
    setError("");
    const response = await fetch(input, init);
    setBusy("");
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "操作失败");
      return;
    }
    if (after) {
      after();
      return;
    }
    router.refresh();
  }

  function removeJob() {
    if (!window.confirm("删除记录不会删除课程云盘原文件，也不会回滚已保存的课程目录。确认删除？")) return;
    void action("delete", `/api/ai-import/${jobId}`, { method: "DELETE" }, () => {
      router.replace(`/space/courses/${courseId}/ai-workbench/content`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-md border border-[var(--cx-border)] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">审核与发布</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">导入产物</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "FAILED" ? (
            <Button type="button" variant="secondary" onClick={() => action("retry", `/api/ai-import/${jobId}/retry`, { method: "POST" })} disabled={busy === "retry"}>
              <RefreshCw className="h-4 w-4" />
              {busy === "retry" ? "重试中" : "重试任务"}
            </Button>
          ) : null}
          <Button type="button" variant="danger" onClick={removeJob} disabled={busy === "delete"}>
            <Trash2 className="h-4 w-4" />
            删除任务
          </Button>
        </div>
      </div>

      {map ? (
        <div className="grid gap-3">
          <div className="rounded-md bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">{map.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{map.status === "PUBLISHED" ? "已自动发布" : "历史草稿，未发布"}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{map.summary ?? "根据课程目录生成的知识图谱草稿。"}</p>
            <p className="mt-2 text-xs text-slate-500">{map.nodes.length} 个节点，{map.edges.length} 条关系</p>
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">任务完成后会在这里出现自动发布的知识图谱。</p>
      )}

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
