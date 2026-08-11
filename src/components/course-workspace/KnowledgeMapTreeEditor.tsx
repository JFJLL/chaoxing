"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  buildKnowledgeOutline,
  outlineContentTypes,
  outlineToGraph,
  outlineTypeLabels,
  serializeKnowledgeOutline,
  type KnowledgeOutlineNode,
  type KnowledgeOutlineNodeType
} from "@/lib/knowledgeMap/knowledgeMapOutline";

type SourceNode = { id: string; type: string; label: string; order: number };
type SourceEdge = { id: string; sourceId: string; targetId: string; type: string };
type OutlineGraph = { nodes: Array<{ id: string; type: string; label: string; summary: null; order: number }>; edges: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string }> };

type Props = {
  nodes: SourceNode[];
  edges: SourceEdge[];
  onSerializedChange: (text: string) => void;
  onPreviewChange: (graph: OutlineGraph) => void;
  onValidityChange: (message: string) => void;
};

function newId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultLabel(type: KnowledgeOutlineNodeType) {
  if (type === "objective") return "新目标";
  if (type === "document") return "新文档";
  return `新${outlineTypeLabels[type] ?? "节点"}`;
}

function mapNode(root: KnowledgeOutlineNode, id: string, update: (node: KnowledgeOutlineNode) => KnowledgeOutlineNode): KnowledgeOutlineNode {
  if (root.id === id) return update(root);
  return { ...root, children: root.children.map((child) => mapNode(child, id, update)) };
}

function parentOf(root: KnowledgeOutlineNode, id: string): { parent: KnowledgeOutlineNode; index: number } | null {
  const index = root.children.findIndex((child) => child.id === id);
  if (index >= 0) return { parent: root, index };
  for (const child of root.children) {
    const found = parentOf(child, id);
    if (found) return found;
  }
  return null;
}

function countDocuments(node: KnowledgeOutlineNode): number {
  return (node.type === "document" ? 1 : 0) + node.children.reduce((sum, child) => sum + countDocuments(child), 0);
}

function hasEmptyLabel(node: KnowledgeOutlineNode): boolean {
  return !node.label.trim() || node.children.some(hasEmptyLabel);
}

export function KnowledgeMapTreeEditor({ nodes, edges, onSerializedChange, onPreviewChange, onValidityChange }: Props) {
  const initial = useMemo(() => buildKnowledgeOutline(nodes, edges), [nodes, edges]);
  const [root, setRoot] = useState<KnowledgeOutlineNode | null>(initial);
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (!root) return;
    onSerializedChange(serializeKnowledgeOutline(root));
    onPreviewChange(outlineToGraph(root));
    let message = "";
    if (hasEmptyLabel(root)) message = "节点名称不能为空";
    else if (countDocuments(root) < 1) message = "至少需要一个文档节点";
    onValidityChange(message);
  }, [root, onSerializedChange, onPreviewChange, onValidityChange]);

  if (!root) {
    return <p className="text-sm text-slate-500">图谱缺少课程根节点，无法编辑。</p>;
  }

  const setLabel = (id: string, label: string) => setRoot(mapNode(root, id, (node) => ({ ...node, label })));

  const addChild = (parentId: string, type: KnowledgeOutlineNodeType) => {
    const id = newId();
    setRoot(mapNode(root, parentId, (node) => ({ ...node, children: [...node.children, { id, type, label: defaultLabel(type), children: [] }] })));
    setAddingChildFor(null);
    setFocusedId(id);
  };

  const addSibling = (id: string) => {
    const location = parentOf(root, id);
    if (!location) return;
    const type = location.parent.children[location.index]!.type as KnowledgeOutlineNodeType;
    const child: KnowledgeOutlineNode = { id: newId(), type, label: defaultLabel(type), children: [] };
    setRoot(mapNode(root, location.parent.id, (node) => {
      const children = node.children.slice();
      children.splice(location.index + 1, 0, child);
      return { ...node, children };
    }));
    setFocusedId(child.id);
  };

  const removeNode = (id: string) => {
    if (id === root.id) return;
    const location = parentOf(root, id);
    if (!location) return;
    const node = location.parent.children[location.index]!;
    if (node.type === "document" && countDocuments(root) <= 1) return;
    setRoot(mapNode(root, location.parent.id, (parent) => ({ ...parent, children: parent.children.filter((child) => child.id !== id) })));
    setAddingChildFor(null);
  };

  const moveNode = (id: string, direction: -1 | 1, sameType: boolean) => {
    const location = parentOf(root, id);
    if (!location) return;
    const { parent, index } = location;
    const targetIndex = sameType
      ? (() => {
          const type = parent.children[index]!.type;
          for (let current = index + direction; current >= 0 && current < parent.children.length; current += direction) {
            if (parent.children[current]!.type === type) return current;
          }
          return -1;
        })()
      : index + direction;
    if (targetIndex < 0 || targetIndex >= parent.children.length) return;
    setRoot(mapNode(root, parent.id, (node) => {
      const children = node.children.slice();
      [children[index], children[targetIndex]] = [children[targetIndex]!, children[index]!];
      return { ...node, children };
    }));
  };

  const renderTypeMenu = (node: KnowledgeOutlineNode) => {
    const types = node.type === "course"
      ? [{ type: "objective" as const, label: "综合目标" }, { type: "document" as const, label: "文档" }]
      : outlineContentTypes;
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50/70 p-2">
        <span className="px-1 text-xs text-slate-500">添加下级：</span>
        {types.map((item) => (
          <button key={item.type} type="button" onClick={() => addChild(node.id, item.type)} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-100">
            {item.label}
          </button>
        ))}
      </div>
    );
  };

  const renderRow = (node: KnowledgeOutlineNode) => {
    const isRoot = node.type === "course";
    const isLastDocument = node.type === "document" && countDocuments(root) <= 1;
    const canHaveChildren = isRoot || node.type !== "objective";
    const movesWithinGroup = node.type === "objective" || node.type === "document";
    return (
      <div key={node.id} className="min-w-0">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${isRoot ? "bg-blue-600 text-white" : node.type === "objective" ? "bg-emerald-100 text-emerald-700" : node.type === "document" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
            {outlineTypeLabels[node.type] ?? node.type}
          </span>
          <input
            aria-label={`${outlineTypeLabels[node.type] ?? "节点"}名称`}
            value={node.label}
            autoFocus={focusedId === node.id}
            onChange={(event) => setLabel(node.id, event.target.value)}
            placeholder={outlineTypeLabels[node.type] ?? "节点名称"}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-blue-50/40"
          />
          <div className="flex shrink-0 items-center gap-0.5">
            {canHaveChildren ? (
              <button
                type="button"
                title={`为${outlineTypeLabels[node.type] ?? "节点"}添加下级`}
                aria-label={`为${outlineTypeLabels[node.type] ?? "节点"}添加下级`}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                onClick={() => setAddingChildFor(addingChildFor === node.id ? null : node.id)}
              >
                {addingChildFor === node.id ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            ) : null}
            {!isRoot ? (
              <button type="button" title="添加同级" aria-label="添加同级" className="rounded-lg p-1 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600" onClick={() => addSibling(node.id)}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {!isRoot ? (
              <>
                <button type="button" title="上移" aria-label="上移" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => moveNode(node.id, -1, movesWithinGroup)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="下移" aria-label="下移" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => moveNode(node.id, 1, movesWithinGroup)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
            {!isRoot ? (
              <button
                type="button"
                title={isLastDocument ? "至少保留一个文档节点" : "删除"}
                aria-label="删除节点"
                disabled={isLastDocument}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() => removeNode(node.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        {addingChildFor === node.id ? <div className="mt-1.5">{renderTypeMenu(node)}</div> : null}
        {!isRoot && node.children.length ? (
          <div className="ml-1.5 mt-1.5 space-y-1.5 border-l border-slate-200 pl-2.5">
            {node.children.map((child) => renderRow(child))}
          </div>
        ) : null}
      </div>
    );
  };

  const objectives = root.children.filter((node) => node.type === "objective");
  const documents = root.children.filter((node) => node.type === "document");

  return (
    <div className="mt-4 min-h-[480px] max-h-[680px] w-full flex-1 overflow-y-auto pr-1 text-sm" aria-label="知识图谱大纲编辑器">
      <div className="mb-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">
        左侧实时预览编辑结果；右侧按大纲编辑课程、综合目标与文档节点。保存后发布为新版本并更新图谱。
      </div>
      {renderRow(root)}
      {objectives.length ? (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />综合目标
          </p>
          <div className="space-y-1.5">{objectives.map((child) => renderRow(child))}</div>
        </div>
      ) : null}
      {documents.map((child) => (
        <div key={child.id} className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />文档
          </p>
          <div className="space-y-1.5">{renderRow(child)}</div>
        </div>
      ))}
    </div>
  );
}
