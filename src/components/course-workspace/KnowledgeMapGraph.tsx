"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Move, Plus } from "lucide-react";

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
type ViewTransform = { x: number; y: number; scale: number };
type LayoutOffset = { x: number; y: number };
type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };

const hierarchyLevel: Record<string, number> = {
  course: 0,
  objective: 1,
  document: 1,
  chapter: 2,
  lesson: 3,
  concept: 4,
  activity: 4,
  skill: 4,
  case: 4,
  assessment: 4
};

const structuralEdgeTypes = new Set(["outcome", "contains", "practice", "checks"]);

const styleByType: Record<string, NodeStyle> = {
  course: { fill: "#2563eb", stroke: "#1d4ed8", text: "#ffffff", soft: "#dbeafe" },
  objective: { fill: "#ecfdf5", stroke: "#10b981", text: "#065f46", soft: "#d1fae5" },
  document: { fill: "#eef2ff", stroke: "#6366f1", text: "#312e81", soft: "#e0e7ff" },
  chapter: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1e3a8a", soft: "#dbeafe" },
  lesson: { fill: "#fff7ed", stroke: "#f97316", text: "#7c2d12", soft: "#ffedd5" },
  concept: { fill: "#faf5ff", stroke: "#a855f7", text: "#581c87", soft: "#f3e8ff" },
  activity: { fill: "#ecfeff", stroke: "#06b6d4", text: "#164e63", soft: "#cffafe" },
  skill: { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63", soft: "#cffafe" },
  case: { fill: "#fdf2f8", stroke: "#db2777", text: "#831843", soft: "#fce7f3" },
  assessment: { fill: "#fefce8", stroke: "#eab308", text: "#713f12", soft: "#fef9c3" }
};

const NODE_WIDTH = 256;
const ROOT_WIDTH = 248;
const MIN_NODE_HEIGHT = 72;
const TEXT_LINE_HEIGHT = 19;
const TEXT_VERTICAL_PADDING = 28;
const GAP_X = 88;
const GAP_Y = 22;
const PADDING_X = 52;
const PADDING_Y = 56;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;

export function wrapKnowledgeLabel(value: string, maxCharacters = 14) {
  const characters = Array.from(value.trim().replace(/\s+/g, " "));
  if (!characters.length) return [""];
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += maxCharacters) {
    lines.push(characters.slice(index, index + maxCharacters).join(""));
  }
  return lines;
}

function nodeMetrics(node: KnowledgeNode, root: boolean) {
  const lines = wrapKnowledgeLabel(node.label, root ? 18 : 12);
  return {
    width: root ? ROOT_WIDTH : NODE_WIDTH,
    height: Math.max(MIN_NODE_HEIGHT, lines.length * TEXT_LINE_HEIGHT + TEXT_VERTICAL_PADDING),
    lines
  };
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    course: "课程",
    objective: "目标",
    document: "文档",
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

function clampScale(scale: number, fittedScale: number) {
  return Math.min(fittedScale * MAX_SCALE, Math.max(fittedScale * MIN_SCALE, scale));
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
    return { rootId: null, width: 960, height: 480, positions, links: [] as TreeLink[], secondaryEdgeCount: edges.length };
  }

  const topLevel = childrenByParent.get(root.id) ?? [];
  const leftRoots = topLevel.filter((node) => node.type === "objective");
  const rightRoots = topLevel.filter((node) => node.type !== "objective");
  const metricsById = new Map(nodes.map((node) => [node.id, nodeMetrics(node, node.id === root.id)]));
  const spanCache = new Map<string, number>();

  const subtreeSpan = (nodeId: string): number => {
    const cached = spanCache.get(nodeId);
    if (cached !== undefined) return cached;
    const children = childrenByParent.get(nodeId) ?? [];
    const nodeHeight = metricsById.get(nodeId)?.height ?? MIN_NODE_HEIGHT;
    const span = children.length
      ? Math.max(nodeHeight, children.reduce((total, child) => total + subtreeSpan(child.id), 0) + GAP_Y * (children.length - 1))
      : nodeHeight;
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
  const rootMetrics = metricsById.get(root.id) ?? nodeMetrics(root, true);
  const rootX = PADDING_X + leftDepth * (NODE_WIDTH + GAP_X);
  const width = Math.max(960, PADDING_X * 2 + leftDepth * (NODE_WIDTH + GAP_X) + ROOT_WIDTH + rightDepth * (NODE_WIDTH + GAP_X));
  const contentSpan = Math.max(rootMetrics.height, forestSpan(leftRoots), forestSpan(rightRoots));
  const height = Math.max(520, PADDING_Y * 2 + contentSpan);
  const rootY = height / 2 - rootMetrics.height / 2;
  positions.set(root.id, { x: rootX, y: rootY, width: rootMetrics.width, height: rootMetrics.height, side: "root" });

  const links: TreeLink[] = [];
  const layoutSubtree = (node: KnowledgeNode, side: "left" | "right", depth: number, top: number) => {
    const children = childrenByParent.get(node.id) ?? [];
    const metrics = metricsById.get(node.id) ?? nodeMetrics(node, false);
    const span = subtreeSpan(node.id);
    let y = top + (span - metrics.height) / 2;
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
      y = (firstCenter + lastCenter) / 2 - metrics.height / 2;
    }

    const x = side === "left"
      ? rootX - depth * (NODE_WIDTH + GAP_X)
      : rootX + ROOT_WIDTH + GAP_X + (depth - 1) * (NODE_WIDTH + GAP_X);
    const position: NodePosition = { x, y, width: metrics.width, height: metrics.height, side };
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

function fitScale(layoutWidth: number, layoutHeight: number, viewportWidth: number, viewportHeight: number) {
  if (!viewportWidth || !viewportHeight) return 1;
  return Math.min((viewportWidth - 64) / layoutWidth, (viewportHeight - 64) / layoutHeight, 1);
}

export function anchorLayoutToNode(
  currentOffset: LayoutOffset,
  previous: Pick<NodePosition, "x" | "y" | "width" | "height">,
  next: Pick<NodePosition, "x" | "y" | "width" | "height">
): LayoutOffset {
  return {
    x: currentOffset.x + previous.x + previous.width / 2 - next.x - next.width / 2,
    y: currentOffset.y + previous.y + previous.height / 2 - next.y - next.height / 2
  };
}

const GraphCanvas = memo(function GraphCanvas({
  nodes,
  edges,
  expandedIds,
  layoutOffset,
  onContentRef,
  onToggle
}: {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  expandedIds: Set<string>;
  layoutOffset: LayoutOffset;
  onContentRef: (element: SVGGElement | null) => void;
  onToggle: (nodeId: string) => void;
}) {
  const hierarchy = useMemo(() => buildKnowledgeHierarchyIndex(nodes, edges), [nodes, edges]);
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

  if (!layout.rootId) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label="课程思维导图"
      shapeRendering="geometricPrecision"
      textRendering="optimizeLegibility"
    >
      <g ref={onContentRef}>
        <g transform={`translate(${layoutOffset.x} ${layoutOffset.y})`}>
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

          {visibleNodes.map((node) => {
            const position = layout.positions.get(node.id);
            if (!position) return null;
            const root = position.side === "root";
            const childCount = hierarchy.childrenByParent.get(node.id)?.length ?? 0;
            const expanded = expandedIds.has(node.id);
            const color = styleByType[node.type] ?? { fill: "#f8fafc", stroke: "#64748b", text: "#334155", soft: "#e2e8f0" };
            const lines = wrapKnowledgeLabel(node.label, root ? 18 : 12);
            const textStartY = position.height / 2 - ((lines.length - 1) * TEXT_LINE_HEIGHT) / 2;
            return (
              <g
                key={node.id}
                transform={`translate(${position.x}, ${position.y.toFixed(1)})`}
                data-node-id={node.id}
                data-node-type={node.type}
              >
                <rect width={position.width} height={position.height} rx={root ? 22 : 16} fill={color.fill} stroke={color.stroke} strokeWidth={root ? 2 : 1.5} />
                {root ? (
                  <text x={position.width / 2 + 8} y={textStartY} textAnchor="middle" dominantBaseline="middle" fill={color.text} fontSize="15" fontWeight="800">
                    {lines.map((line, index) => <tspan key={`${line}-${index}`} x={position.width / 2 + 8} dy={index === 0 ? 0 : TEXT_LINE_HEIGHT}>{line}</tspan>)}
                  </text>
                ) : (
                  <>
                    <rect x="34" y={position.height / 2 - 12} width="40" height="24" rx="12" fill={color.soft} />
                    <text x="54" y={position.height / 2} textAnchor="middle" dominantBaseline="middle" fill={color.text} fontSize="11" fontWeight="800">{typeLabel(node.type)}</text>
                    <text x="84" y={textStartY} dominantBaseline="middle" fill={color.text} fontSize="13" fontWeight="800">
                      {lines.map((line, index) => <tspan key={`${line}-${index}`} x="84" dy={index === 0 ? 0 : TEXT_LINE_HEIGHT}>{line}</tspan>)}
                    </text>
                  </>
                )}
                {childCount ? (
                  <g
                    transform={`translate(20, ${position.height / 2})`}
                    role="button"
                    tabIndex={0}
                    data-cx-no-pending="true"
                    aria-label={`${expanded ? "收起" : "展开"}${node.label}，${childCount} 个下级节点`}
                    className="cursor-pointer"
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") event.preventDefault();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onToggle(node.id);
                      }
                    }}
                  >
                    <circle r="10" fill={expanded ? color.stroke : "#ffffff"} stroke={color.stroke} strokeWidth="1.5" />
                    <path d={expanded ? "M -4 -2 L 4 -2 L 0 3 Z" : "M -2 -4 L 3 0 L -2 4 Z"} fill={expanded ? "#ffffff" : color.stroke} />
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
});

export function KnowledgeMapGraph({ nodes, edges }: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }) {
  const hierarchy = useMemo(() => buildKnowledgeHierarchyIndex(nodes, edges), [nodes, edges]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (hierarchy.root) {
      initial.add(hierarchy.root.id);
      for (const node of nodes) if (node.type === "document") initial.add(node.id);
    }
    return initial;
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<SVGGElement | null>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const layoutSizeRef = useRef({ width: 960, height: 520 });
  const fitRef = useRef(1);
  const dragRef = useRef<DragState | null>(null);
  const viewInitializedRef = useRef(false);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const layoutOffsetRef = useRef<LayoutOffset>({ x: 0, y: 0 });
  const [layoutOffset, setLayoutOffset] = useState<LayoutOffset>({ x: 0, y: 0 });
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
  layoutSizeRef.current = { width: layout.width, height: layout.height };

  const applyView = useCallback((next: ViewTransform) => {
    viewRef.current = next;
    contentRef.current?.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.scale})`);
    if (scaleLabelRef.current) {
      scaleLabelRef.current.textContent = `${Math.round(next.scale * 100)}%`;
    }
  }, []);

  const registerContent = useCallback((element: SVGGElement | null) => {
    contentRef.current = element;
    if (element && viewInitializedRef.current) {
      const view = viewRef.current;
      element.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.scale})`);
    }
  }, []);

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const size = layoutSizeRef.current;
    const fit = fitScale(size.width, size.height, viewport.clientWidth, viewport.clientHeight);
    const offset = layoutOffsetRef.current;
    fitRef.current = fit;
    applyView({
      scale: fit,
      x: (viewport.clientWidth - size.width * fit) / 2 - offset.x * fit,
      y: (viewport.clientHeight - size.height * fit) / 2 - offset.y * fit
    });
  }, [applyView]);

  const viewForZoom = useCallback((requestedScale: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    const current = viewRef.current;
    const scale = clampScale(requestedScale, fitRef.current);
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const canvasX = (anchorX - current.x) / current.scale;
    const canvasY = (anchorY - current.y) / current.scale;
    return {
      scale,
      x: anchorX - canvasX * scale,
      y: anchorY - canvasY * scale
    };
  }, []);

  const zoomAt = useCallback((requestedScale: number, clientX?: number, clientY?: number) => {
    const next = viewForZoom(requestedScale, clientX, clientY);
    if (next) applyView(next);
  }, [applyView, viewForZoom]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!viewInitializedRef.current) {
      viewInitializedRef.current = true;
      viewportSizeRef.current = { width: viewport.clientWidth, height: viewport.clientHeight };
      fitView();
      return;
    }
    fitRef.current = fitScale(layout.width, layout.height, viewport.clientWidth, viewport.clientHeight);
  }, [applyView, fitView, layout]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const previous = viewportSizeRef.current;
      const next = { width: viewport.clientWidth, height: viewport.clientHeight };
      viewportSizeRef.current = next;
      if (!viewInitializedRef.current || !previous.width || !previous.height) return;
      fitRef.current = fitScale(layoutSizeRef.current.width, layoutSizeRef.current.height, next.width, next.height);
      applyView({
        ...viewRef.current,
        x: viewRef.current.x + (next.width - previous.width) / 2,
        y: viewRef.current.y + (next.height - previous.height) / 2
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.002);
      zoomAt(viewRef.current.scale * factor, event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  const toggleBranch = (nodeId: string) => {
    const children = hierarchy.childrenByParent.get(nodeId) ?? [];
    if (!children.length) return;
    const nextExpanded = new Set(expandedIds);
    const removeBranch = (branchId: string) => {
      nextExpanded.delete(branchId);
      for (const child of hierarchy.childrenByParent.get(branchId) ?? []) removeBranch(child.id);
    };
    if (nextExpanded.has(nodeId)) removeBranch(nodeId);
    else nextExpanded.add(nodeId);
    if (hierarchy.root) nextExpanded.add(hierarchy.root.id);

    const nextVisibleIds = new Set<string>();
    if (hierarchy.root) {
      nextVisibleIds.add(hierarchy.root.id);
      const visit = (parentId: string) => {
        if (!nextExpanded.has(parentId)) return;
        for (const child of hierarchy.childrenByParent.get(parentId) ?? []) {
          nextVisibleIds.add(child.id);
          visit(child.id);
        }
      };
      visit(hierarchy.root.id);
    }
    const nextVisibleNodes = nodes.filter((node) => nextVisibleIds.has(node.id));
    const nextVisibleEdges = edges.filter((edge) => nextVisibleIds.has(edge.sourceId) && nextVisibleIds.has(edge.targetId));
    const nextLayout = buildKnowledgeMindMapLayout(nextVisibleNodes, nextVisibleEdges);
    const previousPosition = layout.positions.get(nodeId);
    const nextPosition = nextLayout.positions.get(nodeId);
    if (previousPosition && nextPosition) {
      const nextOffset = anchorLayoutToNode(layoutOffsetRef.current, previousPosition, nextPosition);
      layoutOffsetRef.current = nextOffset;
      setLayoutOffset(nextOffset);
    }
    setExpandedIds(nextExpanded);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-node-id]")) return;
    const current = viewRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyView({
      scale: viewRef.current.scale,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grab";
  };

  if (!layout.rootId) {
    return <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">图谱中暂无可展示节点。</p>;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">课程思维导图</h2>
          <p className="mt-1 text-xs text-slate-500">点击节点左侧按钮展开或收起；拖动画布，使用 Ctrl/⌘ + 滚轮缩放。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hiddenNodeCount > 0 ? <span className="rounded-full bg-[#FDF3F0] px-3 py-1 text-xs font-medium text-[#8E3425]">{hiddenNodeCount} 个下级节点已收起</span> : null}
          {hierarchy.secondaryEdgeCount > 0 ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{hierarchy.secondaryEdgeCount} 条交叉关系已收起</span> : null}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="思维导图缩放控制">
            <button type="button" data-cx-no-pending="true" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="缩小思维导图" title="缩小" onClick={() => zoomAt(viewRef.current.scale / (1 + ZOOM_STEP))}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span ref={scaleLabelRef} className="w-12 text-center text-xs font-medium tabular-nums text-slate-600">100%</span>
            <button type="button" data-cx-no-pending="true" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="放大思维导图" title="放大" onClick={() => zoomAt(viewRef.current.scale * (1 + ZOOM_STEP))}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <button type="button" data-cx-no-pending="true" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100" aria-label="适应画布" title="适应画布" onClick={fitView}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              适应
            </button>
          </div>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="relative h-[560px] cursor-grab touch-none select-none overflow-hidden bg-gradient-to-br from-slate-50 via-white to-[#FDF3F0]/60 lg:h-[680px]"
        aria-label="思维导图画布，可拖动和缩放"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs text-slate-500 shadow-sm backdrop-blur" aria-hidden="true">
          <Move className="h-3.5 w-3.5" />
          拖动查看
        </div>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          expandedIds={expandedIds}
          layoutOffset={layoutOffset}
          onContentRef={registerContent}
          onToggle={toggleBranch}
        />
      </div>
    </div>
  );
}
