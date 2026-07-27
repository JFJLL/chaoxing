"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Network, PlaySquare, RefreshCw, Trash2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";

type KnowledgeMapSummary = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ id: string; type: string }>;
};

type HtmlArtifactSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
};

export function ImportJobManager({
  courseId,
  jobId,
  status,
  map,
  htmlArtifact
}: {
  courseId: string;
  jobId: string;
  status: string;
  map: KnowledgeMapSummary | null;
  htmlArtifact: HtmlArtifactSummary | null;
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
    if (!window.confirm("删除后会同步移除该任务生成的知识图谱；已发布课件保留。确认删除？")) return;
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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-md bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">{map.title}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{map.status === "PUBLISHED" ? "已发布" : "草稿"}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{map.summary ?? "根据课程目录生成的知识图谱草稿。"}</p>
            <p className="mt-2 text-xs text-slate-500">{map.nodes.length} 个节点，{map.edges.length} 条关系</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => action("publish-map", `/api/courses/${courseId}/knowledge-maps/${map.id}/publish`, { method: "POST" })}
              disabled={busy === "publish-map" || map.status === "PUBLISHED"}
            >
              <Network className="h-4 w-4" />
              {map.status === "PUBLISHED" ? "导图已发布" : "发布导图"}
            </Button>
            <LinkButton href={`/space/courses/${courseId}/ai-workbench/apps/courseware`} variant="secondary">
              编辑 AI 课件
            </LinkButton>
            <LinkButton href={`/space/courses/${courseId}/ai-workbench/apps/ppt_courseware`}>
              <PlaySquare className="h-4 w-4" />
              前往 PPT 课件
            </LinkButton>
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">任务完成后会在这里出现知识图谱草稿。</p>
      )}

      {htmlArtifact ? (
        <div className="grid gap-3 rounded-md bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <div className="flex items-center gap-2">
              <PlaySquare className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium text-slate-900">{htmlArtifact.title}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{htmlArtifact.status === "PUBLISHED" ? "已发布" : "草稿"}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">HTML 课件生成后可独立发布，学生只会看到已发布版本。</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => action("publish-html", `/api/courses/${courseId}/ai-artifacts/${htmlArtifact.id}/publish`, { method: "POST" })}
              disabled={busy === "publish-html" || htmlArtifact.status === "PUBLISHED"}
            >
              <PlaySquare className="h-4 w-4" />
              {htmlArtifact.status === "PUBLISHED" ? "课件已发布" : "发布课件"}
            </Button>
            {htmlArtifact.status === "PUBLISHED" ? (
              <LinkButton href={`/space/courses/${courseId}/html-courseware`} variant="secondary">
                播放课件
              </LinkButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
