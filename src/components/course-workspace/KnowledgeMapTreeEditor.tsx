"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  buildKnowledgeOutline,
  outlineContentTypes,
  outlineToGraph,
  outlineTypeLabels,
  reorderTreeChildren,
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

type DragState = {
  id: string;
  parentId: string;
  predicate: (node: KnowledgeOutlineNode) => boolean;
  listEl: HTMLElement;
  unitEl: HTMLElement;
  overIndex: number;
  pointerId: number;
  offsetY: number;
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

function findNode(root: KnowledgeOutlineNode, id: string): KnowledgeOutlineNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
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
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    const visit = (node: KnowledgeOutlineNode) => {
      if (node.children.length && node.type !== "course" && node.type !== "objective" && node.type !== "document") collapsed.add(node.id);
      node.children.forEach(visit);
    };
    if (initial) visit(initial);
    return collapsed;
  });
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!root) return;
    onSerializedChange(serializeKnowledgeOutline(root));
    onPreviewChange(outlineToGraph(root));
    let message = "";
    if (hasEmptyLabel(root)) message = "节点名称不能为空";
    else if (countDocuments(root) < 1) message = "至少需要一个文档节点";
    onValidityChange(message);
  }, [root, onSerializedChange, onPreviewChange, onValidityChange]);

  useEffect(() => () => {
    cleanupDrag();
  }, []);

  if (!root) {
    return <p className="text-sm text-slate-500">图谱缺少课程根节点，无法编辑。</p>;
  }

  const setLabel = (id: string, label: string) => setRoot(mapNode(root, id, (node) => ({ ...node, label })));

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addChild = (parentId: string, type: KnowledgeOutlineNodeType) => {
    const id = newId();
    setRoot(mapNode(root, parentId, (node) => ({ ...node, children: [...node.children, { id, type, label: defaultLabel(type), children: [] }] })));
    setCollapsedIds((current) => {
      const next = new Set(current);
      next.delete(parentId);
      return next;
    });
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

  function cleanupDrag() {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    if (indicatorRef.current) {
      indicatorRef.current.remove();
      indicatorRef.current = null;
    }
    const drag = dragRef.current;
    if (drag) drag.unitEl.classList.remove("opacity-30");
    dragRef.current = null;
  }

  function positionGhost(clientX: number, clientY: number) {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.transform = `translate(${clientX + 10}px, ${clientY - dragRef.current!.offsetY}px)`;
  }

  function updateIndicator(clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const units = [...drag.listEl.querySelectorAll<HTMLElement>(":scope > [data-drag-unit]")].filter((unit) => unit !== drag.unitEl);
    let over = units.length;
    for (let i = 0; i < units.length; i += 1) {
      const rect = units[i]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        over = i;
        break;
      }
    }
    drag.overIndex = over;
    const indicator = indicatorRef.current;
    if (!indicator) return;
    const listRect = drag.listEl.getBoundingClientRect();
    const top = over < units.length
      ? units[over]!.getBoundingClientRect().top - listRect.top
      : units.length ? units[units.length - 1]!.getBoundingClientRect().bottom - listRect.top : 0;
    indicator.style.top = `${Math.max(0, top)}px`;
  }

  function autoScroll(clientY: number) {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    if (clientY < rect.top + 44) scroll.scrollTop -= 8;
    else if (clientY > rect.bottom - 44) scroll.scrollTop += 8;
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, nodeId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const unit = handle.closest<HTMLElement>("[data-drag-unit]");
    const list = handle.closest<HTMLElement>("[data-drag-list]");
    if (!unit || !list) return;
    const filter = list.dataset.dragFilter ?? "";
    const predicate = (node: KnowledgeOutlineNode) => (filter ? node.type === filter : true);
    const rect = unit.getBoundingClientRect();
    const drag: DragState = {
      id: nodeId,
      parentId: list.dataset.dragList!,
      predicate,
      listEl: list,
      unitEl: unit,
      overIndex: [...list.querySelectorAll<HTMLElement>(":scope > [data-drag-unit]")].indexOf(unit),
      pointerId: event.pointerId,
      offsetY: event.clientY - rect.top
    };
    dragRef.current = drag;
    handle.setPointerCapture(event.pointerId);

    const ghost = document.createElement("div");
    ghost.className = "pointer-events-none fixed left-0 top-0 z-50";
    ghost.style.width = `${rect.width}px`;
    const clone = unit.cloneNode(true) as HTMLElement;
    clone.classList.add("rounded-xl", "shadow-xl", "ring-2", "ring-blue-400", "opacity-95", "bg-white");
    ghost.appendChild(clone);
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const indicator = document.createElement("div");
    indicator.className = "pointer-events-none absolute left-1 right-1 z-30 h-0.5 rounded-full bg-blue-500";
    list.appendChild(indicator);
    indicatorRef.current = indicator;

    unit.classList.add("opacity-30");
    positionGhost(event.clientX, event.clientY);
    updateIndicator(event.clientY);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    positionGhost(event.clientX, event.clientY);
    updateIndicator(event.clientY);
    autoScroll(event.clientY);
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { id, parentId, predicate, overIndex } = drag;
    cleanupDrag();
    setRoot((current) => {
      if (!current) return current;
      const parent = findNode(current, parentId);
      if (!parent) return current;
      const next = reorderTreeChildren(parent.children, id, predicate, overIndex);
      return mapNode(current, parentId, (node) => ({ ...node, children: next }));
    });
  }

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
    const collapsed = collapsedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.id} data-drag-unit={node.id} data-drag-type={node.type} className="min-w-0">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          {hasChildren ? (
            <button
              type="button"
              title={collapsed ? "展开" : "收起"}
              aria-label={`${collapsed ? "展开" : "收起"}${outlineTypeLabels[node.type] ?? "节点"}：${node.label}`}
              className="shrink-0 rounded-lg p-0.5 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
              onClick={() => toggleCollapsed(node.id)}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden="true" />
          )}
          {!isRoot ? (
            <button
              type="button"
              title="按住拖动排序"
              aria-label="拖动排序"
              className="shrink-0 cursor-grab touch-none select-none rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
              onPointerDown={(event) => startDrag(event, node.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}
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
        {!isRoot && hasChildren && !collapsed ? (
          <div
            className="relative ml-1.5 mt-1.5 space-y-1.5 border-l border-slate-200 pl-2.5"
            data-drag-list={node.id}
            data-drag-filter=""
          >
            {node.children.map((child) => renderRow(child))}
          </div>
        ) : null}
      </div>
    );
  };

  const objectives = root.children.filter((node) => node.type === "objective");
  const documents = root.children.filter((node) => node.type === "document");

  return (
    <div ref={scrollRef} className="mt-4 min-h-[480px] max-h-[680px] w-full flex-1 overflow-y-auto pr-1 text-sm" aria-label="知识图谱大纲编辑器">
      <div className="mb-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">
        左侧实时预览编辑结果；右侧按大纲编辑，按住手柄可拖动调整顺序。保存后发布为新版本并更新图谱。
      </div>
      {renderRow(root)}
      {objectives.length ? (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />综合目标
          </p>
          <div className="relative space-y-1.5" data-drag-list={root.id} data-drag-filter="objective">
            {objectives.map((child) => renderRow(child))}
          </div>
        </div>
      ) : null}
      {documents.length ? (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />文档
          </p>
          <div className="relative space-y-1.5" data-drag-list={root.id} data-drag-filter="document">
            {documents.map((child) => renderRow(child))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
