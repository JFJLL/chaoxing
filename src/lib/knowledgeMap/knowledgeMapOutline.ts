export type KnowledgeOutlineNodeType =
  | "course"
  | "objective"
  | "document"
  | "chapter"
  | "lesson"
  | "concept"
  | "activity"
  | "skill"
  | "case"
  | "assessment";

export type KnowledgeOutlineNode = {
  id: string;
  type: KnowledgeOutlineNodeType;
  label: string;
  children: KnowledgeOutlineNode[];
};

type OutlineSourceNode = { id: string; type: string; label: string; order: number };
type OutlineSourceEdge = { sourceId: string; targetId: string; type: string };

export const outlineTypeLabels: Record<string, string> = {
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

export const outlineContentTypes: Array<{ type: KnowledgeOutlineNodeType; label: string }> = [
  { type: "chapter", label: "章节" },
  { type: "lesson", label: "课时" },
  { type: "concept", label: "概念" },
  { type: "activity", label: "活动" },
  { type: "skill", label: "技能" },
  { type: "case", label: "案例" },
  { type: "assessment", label: "评价" }
];

const structuralEdgeTypes = new Set(["outcome", "contains", "practice", "checks"]);

/**
 * Builds the editable outline tree (course -> objectives + documents -> nested
 * content nodes) from a knowledge-map graph, following the same structural
 * hierarchy rules as the server-side serializer/parser.
 */
export function buildKnowledgeOutline(
  nodes: OutlineSourceNode[],
  edges: OutlineSourceEdge[]
): KnowledgeOutlineNode | null {
  const root = nodes.find((node) => node.type === "course") ?? nodes[0] ?? null;
  if (!root) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, OutlineSourceNode[]>();
  for (const edge of edges) {
    if (!structuralEdgeTypes.has(edge.type) || !nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    const list = children.get(edge.sourceId) ?? [];
    if (!list.some((node) => node.id === edge.targetId)) list.push(nodeById.get(edge.targetId)!);
    children.set(edge.sourceId, list);
  }
  const sortChildren = (items: OutlineSourceNode[]) => items.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
  const build = (source: OutlineSourceNode): KnowledgeOutlineNode => ({
    id: source.id,
    type: source.type as KnowledgeOutlineNodeType,
    label: source.label,
    children: (children.get(source.id) ?? []).slice().sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN")).map(build)
  });
  return build(root);
}

/**
 * Flattens the outline tree back into a graph of structural nodes/edges that
 * mirrors what the server-side serializer emits (types, edge kinds, labels).
 */
export function outlineToGraph(root: KnowledgeOutlineNode) {
  const nodes: Array<{ id: string; type: string; label: string; summary: null; order: number }> = [];
  const edges: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string }> = [];
  const edgeTypeFor = (child: KnowledgeOutlineNode) => (
    child.type === "objective" ? "outcome"
      : child.type === "activity" ? "practice"
        : child.type === "assessment" ? "checks"
          : "contains"
  );
  const edgeLabelFor = (child: KnowledgeOutlineNode) => (
    child.type === "objective" ? "综合目标"
      : child.type === "document" ? "来源文档"
        : outlineTypeLabels[child.type] ?? "包含"
  );
  const walk = (parent: KnowledgeOutlineNode, depth: number) => {
    for (let index = 0; index < parent.children.length; index += 1) {
      const child = parent.children[index]!;
      nodes.push({ id: child.id, type: child.type, label: child.label, summary: null, order: index + 1 });
      edges.push({ id: `${parent.id}->${child.id}`, sourceId: parent.id, targetId: child.id, type: edgeTypeFor(child), label: edgeLabelFor(child) });
      walk(child, depth + 1);
    }
  };
  nodes.push({ id: root.id, type: root.type, label: root.label, summary: null, order: 0 });
  walk(root, 0);
  return { nodes, edges };
}

/**
 * Serializes the outline tree into the knowledge-map text format understood by
 * parseKnowledgeMapText. Output is byte-for-byte compatible with the
 * server-side serializeKnowledgeMapText for the same structure.
 */
export function serializeKnowledgeOutline(root: KnowledgeOutlineNode): string {
  const lines = [`# ${root.label}`, "", "## 综合目标"];
  const objectives = root.children.filter((node) => node.type === "objective");
  if (!objectives.length) lines.push("- 待补充课程目标");
  else for (const objective of objectives) lines.push(`- ${objective.label}`);

  const writeChildren = (node: KnowledgeOutlineNode, depth: number) => {
    for (const child of node.children) {
      if (child.type === "objective" || child.type === "document") continue;
      lines.push(`${"  ".repeat(depth)}- [${outlineTypeLabels[child.type]}] ${child.label}`);
      writeChildren(child, depth + 1);
    }
  };
  for (const document of root.children.filter((node) => node.type === "document")) {
    lines.push("", `## 文档：${document.label}`);
    writeChildren(document, 0);
  }
  return `${lines.join("\n").trim()}\n`;
}

/**
 * Moves a node within its parent's children. `isGroupMember` selects the
 * siblings the node may be reordered against (e.g. objectives among
 * objectives); `visualIndex` is the insertion index inside that filtered
 * group after removing the dragged node. Non-group siblings keep their slots.
 */
export function reorderTreeChildren(
  children: KnowledgeOutlineNode[],
  nodeId: string,
  isGroupMember: (node: KnowledgeOutlineNode) => boolean,
  visualIndex: number
): KnowledgeOutlineNode[] {
  const dragged = children.find((child) => child.id === nodeId);
  if (!dragged) return children;
  const others = children.filter((child) => child.id !== nodeId);
  const groupOthers = others.filter(isGroupMember);
  const clamped = Math.max(0, Math.min(visualIndex, groupOthers.length));
  const newGroup = [...groupOthers.slice(0, clamped), dragged, ...groupOthers.slice(clamped)];
  let groupIndex = 0;
  return children.map((child) => (isGroupMember(child) ? newGroup[groupIndex++]! : child));
}
