"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Network, Pencil, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { KnowledgeMapGraph, type KnowledgeEdge, type KnowledgeNode } from "@/components/course-workspace/KnowledgeMapGraph";

type DocumentOption = { mapId: string; sourceJobId: string; name: string; version: number; publishedAt: string };
type SavedCompositeOption = { mapId: string; title: string; version: number; publishedAt: string; sourceMapIds: string[] };
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
  savedComposites,
  initialMap,
  initialEditTargetId
}: {
  courseId: string;
  canManage: boolean;
  documents: DocumentOption[];
  savedComposites: SavedCompositeOption[];
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
  const [editorError, setEditorError] = useState("");

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
    setEditorError("");
    if (editTargetId) {
      setEditing(true);
      return;
    }
    const created = await loadSelection(selectedIds, true);
    if (created) setEditing(true);
  }

  function cancelEditing() {
    if (saving) return;
    setEditing(false);
    setEditorError("");
    setText(map.textContent ?? "");
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
      setEditorError(saveError instanceof Error ? saveError.message : "知识图谱保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeMap(targetId: string, targetSelectionIds: string[], isComposite: boolean) {
    if (!window.confirm(isComposite ? "删除教师保存的组合版本后，学生仍可临时组合查看基础文档。确认删除？" : "删除后学生将不再看到这份文档的知识图谱，历史版本也会一并隐藏。确认删除？")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/knowledge-maps/${targetId}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "知识图谱删除失败");
      if (targetSelectionIds.some((id) => selectedIds.includes(id))) {
        const nextIds = selectedIds.filter((id) => !targetSelectionIds.includes(id));
        if (!nextIds.length) window.location.reload();
        else {
          setSelectedIds(nextIds);
          await loadSelection(nextIds, false);
        }
      } else {
        router.refresh();
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
            <div key={document.mapId} className={`flex items-start gap-3 rounded-xl border p-3 transition ${selectedIds.includes(document.mapId) ? "border-blue-200 bg-white shadow-sm" : "border-transparent bg-white/60 hover:border-slate-200"}`}>
              <input type="checkbox" className="mt-1" checked={selectedIds.includes(document.mapId)} onChange={() => toggleDocument(document.mapId)} />
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{document.name}</span><span className="mt-1 block text-xs text-slate-400">v{document.version} · {new Date(document.publishedAt).toLocaleString("zh-CN")}</span></span>
              {canManage ? <button type="button" aria-label={`删除知识图谱：${document.name}`} className="mt-0.5 shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600" disabled={deleting} onClick={() => void removeMap(document.mapId, [document.mapId], false)}><Trash2 className="h-4 w-4" /></button> : null}
            </div>
          ))}
        </div>
        {savedComposites.length ? <div className="mt-4 border-t border-slate-200 pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">已保存组合</h3><span className="text-xs text-slate-500">可再次打开、编辑或删除</span></div><div className="mt-2 grid gap-2 md:grid-cols-2">{savedComposites.map((composite) => <div key={composite.mapId} className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/70 p-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedIds(composite.sourceMapIds); void loadSelection(composite.sourceMapIds, false); }}><span className="block truncate text-sm font-medium text-slate-800">{composite.title}</span><span className="mt-1 block text-xs text-slate-500">v{composite.version} · {new Date(composite.publishedAt).toLocaleString("zh-CN")}</span></button>{canManage ? <button type="button" aria-label={`删除组合：${composite.title}`} className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600" disabled={deleting} onClick={() => void removeMap(composite.mapId, composite.sourceMapIds, true)}><Trash2 className="h-4 w-4" /></button> : null}</div>)}</div></div> : null}
      </section>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className={`relative grid gap-5 ${editing ? "xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.85fr)]" : "xl:grid-cols-[minmax(0,1fr)_320px]"}`}>
        {loading ? <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[28px] bg-white/70 backdrop-blur-sm"><span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow"><Loader2 className="h-4 w-4 animate-spin" />正在归纳共同目标</span></div> : null}
        <KnowledgeMapGraph key={map.id} nodes={map.nodes} edges={map.edges} />
        {editing ? (
          <aside className="flex min-w-0 flex-col rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">文本编辑</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">左侧为当前知识图谱，右侧编辑 Markdown 大纲；保存后发布为新版本并更新图谱。</p>
              </div>
              <Pencil className="h-5 w-5 shrink-0 text-blue-600" />
            </div>
            <textarea
              autoFocus
              aria-label="知识图谱 Markdown 文本"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              className="mt-4 min-h-[480px] w-full flex-1 resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {editorError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{editorError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={cancelEditing}><X className="h-4 w-4" />取消</Button>
              <Button type="button" disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存并发布新版本</Button>
            </div>
          </aside>
        ) : (
          <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-semibold text-slate-900">{map.title}</h2><p className="mt-1 text-xs text-slate-400">已发布版本 v{map.version}</p></div>
              <Network className="h-5 w-5 shrink-0 text-blue-600" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{map.summary ?? "课程知识关系。"}</p>
            {canManage ? <div className="mt-4"><Button type="button" variant="secondary" className="h-9 w-full" disabled={loading} onClick={() => void beginEditing()}><Pencil className="h-4 w-4" />{editTargetId ? "文本编辑" : "保存组合并编辑"}</Button></div> : null}
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">节点</p><p className="mt-1 text-2xl font-semibold">{map.nodes.length}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">关系</p><p className="mt-1 text-2xl font-semibold">{map.edges.length}</p></div></div>
            <div className="mt-4 space-y-2">{relationStats.map(([type, count]) => <div key={type} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs"><span className="text-slate-600">{relationLabels[type] ?? type}</span><span className="font-semibold">{count}</span></div>)}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
