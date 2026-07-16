"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type KnowledgeNode = {
  id: string;
  label: string;
  type: string;
  summary?: string | null;
  order: number;
};

export type KnowledgeEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string | null;
};

type NodeStyle = {
  fill: string;
  stroke: string;
  text: string;
  soft: string;
};

type NodePosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  side: "left" | "right" | "root";
};

type TreeLink = Pick<KnowledgeEdge, "sourceId" | "targetId" | "type">;

const hierarchyLevel: Record<string, number> = {
  course: 0,
  objective: 1,
  chapter: 1,
  lesson: 2,
  concept: 3,
  activity: 3,
  skill: 3,
  case: 3,
  assessment: 3
};

const structuralEdgeTypes = new Set(["outcome", "contains", "practice", "checks"]);

const styleByType: Record<string, NodeStyle> = {
  course: { fill: "#2563eb", stroke: "#1d4ed8", text: "#ffffff", soft: "#dbeafe" },
  objective: { fill: "#ecfdf5", stroke: "#10b981", text: "#065f46", soft: "#d1fae5" },
  chapter: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1e3a8a", soft: "#dbeafe" },
  lesson: { fill: "#fff7ed", stroke: "#f97316", text: "#7c2d12", soft: "#ffedd5" },
  concept: { fill: "#faf5ff", stroke: "#a855f7", text: "#581c87", soft: "#f3e8ff" },
  activity: { fill: "#ecfeff", stroke: "#06b6d4", text: "#164e63", soft: "#cffafe" },
  skill: { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63", soft: "#cffafe" },
  case: { fill: "#fdf2f8", stroke: "#db2777", text: "#831843", soft: "#fce7f3" },
  assessment: { fill: "#fefce8", stroke: "#eab308", text: "#713f12", soft: "#fef9c3" }
};

const NODE_WIDTH = 208;
const ROOT_WIDTH = 232;
const NODE_HEIGHT = 64;
const GAP_X = 72;
const GAP_Y = 22;
const PADDING_X = 44;
const PADDING_Y = 52;

function wrapLabel(value: string, max = 11) {
  const normalized = value.trim();
  if (normalized.length <= max) return [normalized];
  const first = normalized.slice(0, max);
  const rest = normalized.slice(max);
  return [first, rest.length > max ? `${rest.slice(0, max - 1)}…` : rest];
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    course: "课程",
    objective: "目标",
    chapter: "章节",
    lesson: "课时",
    concept: "概念",
    activity: "活动",
    skill: "技能",
    case: "案例",
    assessment: "评价"
  };
  return labels[type] ?? type;
}

function sortNodes(items: KnowledgeNode[]) {
  return items.slice().sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
}

export function buildKnowledgeHierarchyIndex(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const root = nodes.find((node) => node.type === "course") ?? nodes[0] ?? null;
  const parentByTarget = new Map<string, string>();
  const edgeByTarget = new Map<string, TreeLink>();
  let selectedOriginalEdges = 0;

  if (!root) {
    return {
      root,
      parentByTarget,
      edgeByTarget,
      childrenByParent: new Map<string, KnowledgeNode[]>(),
      secondaryEdgeCount: edges.length
    };
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (
      !source
      || !target
      || target.id === root.id
      || parentByTarget.has(target.id)
      || !structuralEdgeTypes.has(edge.type)
      || (hierarchyLevel[target.type] ?? 99) <= (hierarchyLevel[source.type] ?? -1)
    ) continue;
    parentByTarget.set(target.id, source.id);
    edgeByTarget.set(target.id, edge);
    selectedOriginalEdges += 1;
  }

  for (const node of nodes) {
    if (node.id === root.id || parentByTarget.has(node.id)) continue;
    parentByTarget.set(node.id, root.id);
    edgeByTarget.set(node.id, { sourceId: root.id, targetId: node.id, type: node.type === "objective" ? "outcome" : "contains" });
  }

  const childrenByParent = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    const parentId = parentByTarget.get(node.id);
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentId, siblings);
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, sortNodes(children));
  }

  return {
    root,
    parentByTarget,
    edgeByTarget,
    childrenByParent,
    secondaryEdgeCount: Math.max(0, edges.length - selectedOriginalEdges)
  };
}

export function buildKnowledgeMindMapLayout(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const hierarchy = buildKnowledgeHierarchyIndex(nodes, edges);
  const { root, edgeByTarget, childrenByParent } = hierarchy;
  const positions = new Map<string, NodePosition>();
  if (!root) {
    return { rootId: null, width: 960, height: 420, positions, links: [] as TreeLink[], secondaryEdgeCount: edges.length };
  }

  const topLevel = childrenByParent.get(root.id) ?? [];
  const leftRoots = topLevel.filter((node) => node.type === "objective");
  const rightRoots = topLevel.filter((node) => node.type !== "objective");
  const spanCache = new Map<string, number>();

  const subtreeSpan = (nodeId: string): number => {
    const cached = spanCache.get(nodeId);
    if (cached !== undefined) return cached;
    const children = childrenByParent.get(nodeId) ?? [];
    const span = children.length
      ? Math.max(NODE_HEIGHT, children.reduce((total, child) => total + subtreeSpan(child.id), 0) + GAP_Y * (children.length - 1))
      : NODE_HEIGHT;
    spanCache.set(nodeId, span);
    return span;
  };

  const forestSpan = (roots: KnowledgeNode[]) => roots.length
    ? roots.reduce((total, node) => total + subtreeSpan(node.id), 0) + GAP_Y * (roots.length - 1)
    : 0;
  const maxDepth = (roots: KnowledgeNode[], depth = 1): number => roots.reduce(
    (maximum, node) => Math.max(maximum, depth, maxDepth(childrenByParent.get(node.id) ?? [], depth + 1)),
    0
  );

  const leftDepth = maxDepth(leftRoots);
  const rightDepth = maxDepth(rightRoots);
  const rootX = PADDING_X + leftDepth * (NODE_WIDTH + GAP_X);
  const width = Math.max(960, PADDING_X * 2 + leftDepth * (NODE_WIDTH + GAP_X) + ROOT_WIDTH + rightDepth * (NODE_WIDTH + GAP_X));
  const contentSpan = Math.max(NODE_HEIGHT, forestSpan(leftRoots), forestSpan(rightRoots));
  const height = Math.max(480, PADDING_Y * 2 + contentSpan);
  const rootY = height / 2 - NODE_HEIGHT / 2;
  positions.set(root.id, { x: rootX, y: rootY, width: ROOT_WIDTH, height: NODE_HEIGHT, side: "root" });

  const links: TreeLink[] = [];
  const layoutSubtree = (node: KnowledgeNode, side: "left" | "right", depth: number, top: number) => {
    const children = childrenByParent.get(node.id) ?? [];
    const span = subtreeSpan(node.id);
    let y = top + (span - NODE_HEIGHT) / 2;
    if (children.length) {
      let childTop = top;
      let firstCenter = 0;
      let lastCenter = 0;
      children.forEach((child, index) => {
        const childPosition = layoutSubtree(child, side, depth + 1, childTop);
        const center = childPosition.y + childPosition.height / 2;
        if (index === 0) firstCenter = center;
        lastCenter = center;
        childTop += subtreeSpan(child.id) + GAP_Y;
      });
      y = (firstCenter + lastCenter) / 2 - NODE_HEIGHT / 2;
    }

    const x = side === "left"
      ? rootX - depth * (NODE_WIDTH + GAP_X)
      : rootX + ROOT_WIDTH + GAP_X + (depth - 1) * (NODE_WIDTH + GAP_X);
    const position: NodePosition = { x, y, width: NODE_WIDTH, height: NODE_HEIGHT, side };
    positions.set(node.id, position);
    const edge = edgeByTarget.get(node.id);
    if (edge) links.push(edge);
    return position;
  };

  const layoutForest = (roots: KnowledgeNode[], side: "left" | "right") => {
    let top = height / 2 - forestSpan(roots) / 2;
    for (const node of roots) {
      layoutSubtree(node, side, 1, top);
      top += subtreeSpan(node.id) + GAP_Y;
    }
  };
  layoutForest(leftRoots, "left");
  layoutForest(rightRoots, "right");

  return {
    rootId: root.id,
    width,
    height,
    positions,
    links,
    secondaryEdgeCount: hierarchy.secondaryEdgeCount
  };
}

export function KnowledgeMapGraph({ nodes, edges }: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }) {
  const hierarchy = useMemo(() => buildKnowledgeHierarchyIndex(nodes, edges), [nodes, edges]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(hierarchy.root ? [hierarchy.root.id] : []));
  const [focusNodeId, setFocusNodeId] = useState<string | null>(hierarchy.root?.id ?? null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    if (!hierarchy.root) return visible;
    visible.add(hierarchy.root.id);
    const visit = (parentId: string) => {
      if (!expandedIds.has(parentId)) return;
      for (const child of hierarchy.childrenByParent.get(parentId) ?? []) {
        visible.add(child.id);
        visit(child.id);
      }
    };
    visit(hierarchy.root.id);
    return visible;
  }, [expandedIds, hierarchy]);
  const visibleNodes = useMemo(() => nodes.filter((node) => visibleIds.has(node.id)), [nodes, visibleIds]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)),
    [edges, visibleIds]
  );
  const layout = useMemo(() => buildKnowledgeMindMapLayout(visibleNodes, visibleEdges), [visibleEdges, visibleNodes]);
  const hiddenNodeCount = nodes.length - visibleNodes.length;

  useEffect(() => {
    const viewport = viewportRef.current;
    const focusPosition = focusNodeId ? layout.positions.get(focusNodeId) : null;
    if (!viewport || !focusPosition) return;
    viewport.scrollTo({
      left: Math.max(0, focusPosition.x + focusPosition.width / 2 - viewport.clientWidth / 2),
      top: Math.max(0, focusPosition.y + focusPosition.height / 2 - viewport.clientHeight / 2),
      behavior: "auto"
    });
  }, [focusNodeId, layout]);

  const toggleBranch = (nodeId: string) => {
    const children = hierarchy.childrenByParent.get(nodeId) ?? [];
    if (!children.length) return;
    setFocusNodeId(nodeId);
    setExpandedIds((current) => {
      const next = new Set(current);
      const removeBranch = (branchId: string) => {
        next.delete(branchId);
        for (const child of hierarchy.childrenByParent.get(branchId) ?? []) removeBranch(child.id);
      };
      if (next.has(nodeId)) {
        removeBranch(nodeId);
      } else {
        const parentId = hierarchy.parentByTarget.get(nodeId);
        for (const sibling of hierarchy.childrenByParent.get(parentId ?? "") ?? []) {
          if (sibling.id !== nodeId) removeBranch(sibling.id);
        }
        next.add(nodeId);
      }
      if (hierarchy.root) next.add(hierarchy.root.id);
      return next;
    });
  };

  if (!layout.rootId) {
    return <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">图谱中暂无可展示节点。</p>;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">课程思维导图</h2>
          <p className="mt-1 text-xs text-slate-500">学习目标向左展开，课程章节与教学内容向右展开。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hiddenNodeCount > 0 ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">点击节点展开 · {hiddenNodeCount} 个下级节点已收起</span> : null}
          {hierarchy.secondaryEdgeCount > 0 ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{hierarchy.secondaryEdgeCount} 条交叉关系已收起</span> : null}
        </div>
      </div>
      <div ref={viewportRef} className="max-h-[680px] overflow-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/60">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label="课程思维导图"
        >
          <defs>
            <pattern id="mind-map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.28" />
            </pattern>
            <filter id="mind-map-shadow" x="-12%" y="-20%" width="124%" height="150%">
              <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#334155" floodOpacity="0.12" />
            </filter>
          </defs>
          <rect width={layout.width} height={layout.height} fill="url(#mind-map-grid)" />

          {layout.links.map((link) => {
            const source = layout.positions.get(link.sourceId);
            const target = layout.positions.get(link.targetId);
            const targetNode = nodeById.get(link.targetId);
            if (!source || !target || !targetNode) return null;
            const left = target.side === "left";
            const startX = left ? source.x : source.x + source.width;
            const endX = left ? target.x + target.width : target.x;
            const startY = source.y + source.height / 2;
            const endY = target.y + target.height / 2;
            const midX = Math.round((startX + endX) / 2);
            const color = (styleByType[targetNode.type] ?? styleByType.chapter).stroke;
            return (
              <path
                key={`${link.sourceId}-${link.targetId}`}
                d={`M ${startX} ${startY.toFixed(1)} C ${midX} ${startY.toFixed(1)}, ${midX} ${endY.toFixed(1)}, ${endX} ${endY.toFixed(1)}`}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.55"
              />
            );
          })}

          {nodes.map((node) => {
            const position = layout.positions.get(node.id);
            if (!position) return null;
            const root = position.side === "root";
            const childCount = hierarchy.childrenByParent.get(node.id)?.length ?? 0;
            const expanded = expandedIds.has(node.id);
            const color = styleByType[node.type] ?? { fill: "#f8fafc", stroke: "#64748b", text: "#334155", soft: "#e2e8f0" };
            const lines = wrapLabel(node.label, root ? 16 : childCount ? 9 : 11);
            return (
              <g
                key={node.id}
                transform={`translate(${position.x}, ${position.y.toFixed(1)})`}
                data-node-id={node.id}
                data-node-type={node.type}
                filter="url(#mind-map-shadow)"
                role={childCount && !root ? "button" : undefined}
                tabIndex={childCount && !root ? 0 : undefined}
                aria-label={childCount && !root ? `${expanded ? "收起" : "展开"}${node.label}，${childCount} 个下级节点` : undefined}
                className={childCount && !root ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" : undefined}
                onClick={childCount && !root ? () => toggleBranch(node.id) : undefined}
                onKeyDown={childCount && !root ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleBranch(node.id);
                  }
                } : undefined}
              >
                <title>{node.summary ? `${node.label}：${node.summary}` : node.label}</title>
                <rect width={position.width} height={position.height} rx={root ? 22 : 16} fill={color.fill} stroke={color.stroke} strokeWidth={root ? 2 : 1.5} />
                {root ? (
                  <>
                    <text x={position.width / 2} y={lines[1] ? 28 : 38} textAnchor="middle" fill={color.text} fontSize="15" fontWeight="800">
                      {lines[0]}
                    </text>
                    {lines[1] ? <text x={position.width / 2} y="47" textAnchor="middle" fill={color.text} fontSize="15" fontWeight="800">{lines[1]}</text> : null}
                  </>
                ) : (
                  <>
                    <rect x="12" y="20" width="42" height="24" rx="12" fill={color.soft} />
                    <text x="33" y="36" textAnchor="middle" fill={color.text} fontSize="11" fontWeight="800">{typeLabel(node.type)}</text>
                    <text x="64" y={lines[1] ? 26 : 37} fill={color.text} fontSize="13" fontWeight="800">{lines[0]}</text>
                    {lines[1] ? <text x="64" y="45" fill={color.text} fontSize="13" fontWeight="800">{lines[1]}</text> : null}
                    {childCount ? (
                      <>
                        <circle cx="190" cy="14" r="13" fill={color.stroke} />
                        <text x="190" y="18" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800">{expanded ? "−" : `+${childCount}`}</text>
                      </>
                    ) : null}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
