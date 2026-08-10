"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Network, Pencil, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { KnowledgeMapGraph, type KnowledgeEdge, type KnowledgeNode } from "@/components/course-workspace/KnowledgeMapGraph";

type DocumentOption = { mapId: string; sourceJobId: string; name: string; version: number; publishedAt: string };
type MapDto = {
  id: string;
  title: string;
  summary: string | null;
  version: number;
  textContent: string | null;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
};

const relationLabels: Record<string, string> = {
  outcome: "目标关系",
  contains: "结构关系",
  precedes: "先后关系",
  relates: "递进关系",
  practice: "实践关系",
  applies: "应用关系",
  checks: "检测关系",
  evaluates: "评价关系"
};

export function KnowledgeMapWorkspace({
  courseId,
  canManage,
  documents,
  initialMap,
  initialEditTargetId
}: {
  courseId: string;
  canManage: boolean;
  documents: DocumentOption[];
  initialMap: MapDto;
  initialEditTargetId: string | null;
}) {
  const router = useRouter();
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [selectedIds, setSelectedIds] = useState(() => [documents[0]?.mapId].filter(Boolean));
  const confirmedIds = useRef(selectedIds);
  const [map, setMap] = useState(initialMap);
  const [editTargetId, setEditTargetId] = useState(initialEditTargetId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialMap.textContent ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function loadSelection(nextIds: string[], persist = false) {
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/knowledge-maps/composite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapIds: nextIds, persist }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null) as { error?: string; map?: MapDto; editTargetId?: string | null } | null;
      if (!response.ok || !body?.map) throw new Error(body?.error ?? "知识图谱加载失败");
      if (sequence !== requestSequence.current) return;
      setMap(body.map);
      setEditTargetId(body.editTargetId ?? null);
      setText(body.map.textContent ?? "");
      confirmedIds.current = nextIds;
      return body.map;
    } catch (loadError) {
      if (controller.signal.aborted) return null;
      if (sequence === requestSequence.current) {
        setSelectedIds(confirmedIds.current);
        setError(loadError instanceof Error ? loadError.message : "知识图谱加载失败");
      }
      return null;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  function toggleDocument(mapId: string) {
    const next = selectedIds.includes(mapId) ? selectedIds.filter((id) => id !== mapId) : [...selectedIds, mapId];
    if (!next.length) return;
    setSelectedIds(next);
    void loadSelection(next);
  }

  async function beginEditing() {
    setDialogError("");
    if (editTargetId) {
      setEditing(true);
      return;
    }
    const created = await loadSelection(selectedIds, true);
    if (created) setEditing(true);
  }

  async function save() {
    if (!editTargetId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/knowledge-maps/${editTargetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, expectedVersion: map.version })
      });
      const body = await response.json().catch(() => null) as { error?: string; map?: MapDto } | null;
      if (!response.ok) throw new Error(body?.error ?? "知识图谱保存失败");
      if (!body?.map) throw new Error("知识图谱保存结果无效");
      setMap(body.map);
      setEditTargetId(body.map.id);
      setText(body.map.textContent ?? text);
      setEditing(false);
      router.refresh();
    } catch (saveError) {
      setDialogError(saveError instanceof Error ? saveError.message : "知识图谱保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editTargetId || !window.confirm(selectedIds.length > 1 ? "删除教师保存的组合版本后，学生仍可临时组合查看基础文档。确认删除？" : "删除后学生将不再看到这份文档的知识图谱，历史版本也会一并隐藏。确认删除？")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/knowledge-maps/${editTargetId}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "知识图谱删除失败");
      if (selectedIds.length === 1) window.location.reload();
      else {
        setEditTargetId(null);
        await loadSelection(selectedIds, false);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "知识图谱删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const relationStats = Object.entries(map.edges.reduce<Record<string, number>>((acc, edge) => {
    acc[edge.type] = (acc[edge.type] ?? 0) + 1;
    return acc;
  }, {}));

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">选择课程文档</h2>
            <p className="mt-1 text-xs text-slate-500">可多选；预览会智能去重共同目标，保存组合时进一步语义归纳，右侧按文档分别展开。</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700">已选 {selectedIds.length} 份</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <label key={document.mapId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selectedIds.includes(document.mapId) ? "border-blue-200 bg-white shadow-sm" : "border-transparent bg-white/60 hover:border-slate-200"}`}>
              <input type="checkbox" className="mt-1" checked={selectedIds.includes(document.mapId)} onChange={() => toggleDocument(document.mapId)} />
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{document.name}</span><span className="mt-1 block text-xs text-slate-400">v{document.version} · {new Date(document.publishedAt).toLocaleString("zh-CN")}</span></span>
            </label>
          ))}
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {loading ? <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[28px] bg-white/70 backdrop-blur-sm"><span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow"><Loader2 className="h-4 w-4 animate-spin" />正在归纳共同目标</span></div> : null}
        <KnowledgeMapGraph key={map.id} nodes={map.nodes} edges={map.edges} />
        <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="font-semibold text-slate-900">{map.title}</h2><p className="mt-1 text-xs text-slate-400">已发布版本 v{map.version}</p></div>
            <Network className="h-5 w-5 shrink-0 text-blue-600" />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{map.summary ?? "课程知识关系。"}</p>
          {canManage ? <div className={`mt-4 grid gap-2 ${editTargetId ? "grid-cols-2" : "grid-cols-1"}`}><Button type="button" variant="secondary" className="h-9" disabled={loading} onClick={() => void beginEditing()}><Pencil className="h-4 w-4" />{editTargetId ? "文本编辑" : "保存组合并编辑"}</Button>{editTargetId ? <Button type="button" variant="danger" className="h-9" disabled={deleting} onClick={() => void remove()}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}删除</Button> : null}</div> : null}
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">节点</p><p className="mt-1 text-2xl font-semibold">{map.nodes.length}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">关系</p><p className="mt-1 text-2xl font-semibold">{map.edges.length}</p></div></div>
          <div className="mt-4 space-y-2">{relationStats.map(([type, count]) => <div key={type} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs"><span className="text-slate-600">{relationLabels[type] ?? type}</span><span className="font-semibold">{count}</span></div>)}</div>
        </aside>
      </div>

      <Dialog open={editing} title="文本编辑知识图谱" panelClassName="max-w-5xl" onClose={() => !saving && setEditing(false)}>
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">使用 Markdown 大纲编辑。多文档图谱保存为独立组合视图，不会修改各文档的基础图谱。</div>
          <textarea aria-label="知识图谱 Markdown 文本" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} className="min-h-80 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:min-h-[480px]" />
          {dialogError ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{dialogError}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}><X className="h-4 w-4" />取消</Button><Button type="button" disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存并发布新版本</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
