import { randomUUID } from "crypto";
import type { ComposableKnowledgeEdge, ComposableKnowledgeNode } from "@/lib/knowledgeMap/knowledgeMapComposite";

const typeLabels: Record<string, string> = {
  chapter: "章节",
  lesson: "课时",
  concept: "概念",
  activity: "活动",
  skill: "技能",
  case: "案例",
  assessment: "评价"
};
const typesByLabel = new Map(Object.entries(typeLabels).map(([type, label]) => [label, type]));
const structuralEdgeTypes = new Set(["outcome", "contains", "practice", "checks"]);
const MAX_KNOWLEDGE_MAP_NODES = 2_000;
const MAX_KNOWLEDGE_MAP_DEPTH = 24;

export class KnowledgeMapTextError extends Error {
  constructor(message: string, readonly line: number) {
    super(`第 ${line} 行：${message}`);
    this.name = "KnowledgeMapTextError";
  }
}

function hierarchy(nodes: ComposableKnowledgeNode[], edges: ComposableKnowledgeEdge[]) {
  const root = nodes.find((node) => node.type === "course") ?? nodes[0];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, ComposableKnowledgeNode[]>();
  for (const edge of edges) {
    if (!structuralEdgeTypes.has(edge.type) || !nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    const list = children.get(edge.sourceId) ?? [];
    if (!list.some((node) => node.id === edge.targetId)) list.push(nodeById.get(edge.targetId)!);
    children.set(edge.sourceId, list);
  }
  for (const [id, items] of children) children.set(id, items.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN")));
  return { root, children };
}

export function serializeKnowledgeMapText(nodes: ComposableKnowledgeNode[], edges: ComposableKnowledgeEdge[]) {
  const { root, children } = hierarchy(nodes, edges);
  if (!root) return "";
  const lines = [`# ${root.label}`, "", "## 综合目标"];
  const objectives = (children.get(root.id) ?? []).filter((node) => node.type === "objective");
  if (!objectives.length) lines.push("- 待补充课程目标");
  else for (const objective of objectives) lines.push(`- ${objective.label}`);

  const writeChildren = (parentId: string, depth: number) => {
    for (const child of children.get(parentId) ?? []) {
      if (child.type === "objective" || child.type === "document") continue;
      const label = typeLabels[child.type] ?? "概念";
      lines.push(`${"  ".repeat(depth)}- [${label}] ${child.label}`);
      writeChildren(child.id, depth + 1);
    }
  };
  for (const document of (children.get(root.id) ?? []).filter((node) => node.type === "document")) {
    lines.push("", `## 文档：${document.label}`);
    writeChildren(document.id, 0);
  }
  return `${lines.join("\n").trim()}\n`;
}

function matchEditedNodes(
  currentNodes: ComposableKnowledgeNode[],
  currentEdges: ComposableKnowledgeEdge[],
  editedNodes: ComposableKnowledgeNode[],
  editedEdges: ComposableKnowledgeEdge[]
) {
  const currentGraph = hierarchy(currentNodes, currentEdges);
  const editedGraph = hierarchy(editedNodes, editedEdges);
  const matched = new Map<string, string>();
  if (!currentGraph.root || !editedGraph.root) return matched;

  const visit = (current: ComposableKnowledgeNode, edited: ComposableKnowledgeNode) => {
    if (matched.has(current.id)) return;
    matched.set(current.id, edited.id);
    const currentChildren = currentGraph.children.get(current.id) ?? [];
    const editedChildren = editedGraph.children.get(edited.id) ?? [];
    const usedCurrent = new Set<string>();
    const usedEdited = new Set<string>();
    const pairs: Array<[ComposableKnowledgeNode, ComposableKnowledgeNode]> = [];
    const keyFor = (node: ComposableKnowledgeNode) => `${node.type}\u0000${node.label}`;
    const currentKeyCounts = new Map<string, number>();
    const editedKeyCounts = new Map<string, number>();
    for (const node of currentChildren) currentKeyCounts.set(keyFor(node), (currentKeyCounts.get(keyFor(node)) ?? 0) + 1);
    for (const node of editedChildren) editedKeyCounts.set(keyFor(node), (editedKeyCounts.get(keyFor(node)) ?? 0) + 1);

    for (const editedChild of editedChildren) {
      const key = keyFor(editedChild);
      if (currentKeyCounts.get(key) !== 1 || editedKeyCounts.get(key) !== 1) continue;
      const exact = currentChildren.find((currentChild) =>
        !usedCurrent.has(currentChild.id)
        && currentChild.type === editedChild.type
        && currentChild.label === editedChild.label
      );
      if (!exact) continue;
      usedCurrent.add(exact.id);
      usedEdited.add(editedChild.id);
      pairs.push([exact, editedChild]);
    }

    const remainingTypes = new Set([
      ...currentChildren.filter((node) => !usedCurrent.has(node.id)).map((node) => node.type),
      ...editedChildren.filter((node) => !usedEdited.has(node.id)).map((node) => node.type)
    ]);
    for (const type of remainingTypes) {
      const oldGroup = currentChildren.filter((node) => node.type === type && !usedCurrent.has(node.id));
      const newGroup = editedChildren.filter((node) => node.type === type && !usedEdited.has(node.id));
      if (oldGroup.length !== 1 || newGroup.length !== 1) continue;
      if (new Set(oldGroup.map((node) => node.label)).size !== oldGroup.length) continue;
      if (new Set(newGroup.map((node) => node.label)).size !== newGroup.length) continue;
      oldGroup.forEach((oldNode, index) => pairs.push([oldNode, newGroup[index]!]));
    }
    for (const [oldNode, newNode] of pairs) visit(oldNode, newNode);
  };
  visit(currentGraph.root, editedGraph.root);
  return matched;
}

export function mergeKnowledgeMapMetadata(
  currentNodes: ComposableKnowledgeNode[],
  currentEdges: ComposableKnowledgeEdge[],
  editedNodes: ComposableKnowledgeNode[],
  editedEdges: ComposableKnowledgeEdge[]
) {
  const editedIdByCurrentId = matchEditedNodes(currentNodes, currentEdges, editedNodes, editedEdges);
  const currentByEditedId = new Map([...editedIdByCurrentId].map(([currentId, editedId]) => [editedId, currentId]));
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const nodes = editedNodes.map((node) => {
    const currentId = currentByEditedId.get(node.id);
    const current = currentId ? currentNodeById.get(currentId) : null;
    return current ? { ...node, summary: current.summary ?? null, metadata: current.metadata ?? null } : node;
  });
  const currentEdgeByEditedPair = new Map<string, ComposableKnowledgeEdge>();
  for (const edge of currentEdges) {
    const sourceId = editedIdByCurrentId.get(edge.sourceId);
    const targetId = editedIdByCurrentId.get(edge.targetId);
    if (sourceId && targetId) currentEdgeByEditedPair.set(`${sourceId}\u0000${targetId}\u0000${edge.type}`, edge);
  }
  const edges: Array<ComposableKnowledgeEdge & { id: string }> = editedEdges.map((edge) => {
    const current = currentEdgeByEditedPair.get(`${edge.sourceId}\u0000${edge.targetId}\u0000${edge.type}`);
    return current
      ? { ...edge, id: edge.id ?? randomUUID(), label: current.label ?? edge.label, weight: current.weight ?? null, metadata: current.metadata ?? null }
      : { ...edge, id: edge.id ?? randomUUID() };
  });
  const existing = new Set(edges.map((edge) => `${edge.sourceId}\u0000${edge.targetId}\u0000${edge.type}`));
  for (const edge of currentEdges) {
    if (structuralEdgeTypes.has(edge.type)) continue;
    const sourceId = editedIdByCurrentId.get(edge.sourceId);
    const targetId = editedIdByCurrentId.get(edge.targetId);
    if (!sourceId || !targetId) continue;
    const key = `${sourceId}\u0000${targetId}\u0000${edge.type}`;
    if (existing.has(key)) continue;
    existing.add(key);
    edges.push({ ...edge, id: randomUUID(), sourceId, targetId });
  }
  return { nodes, edges };
}

export function parseKnowledgeMapText(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ComposableKnowledgeNode[] = [];
  const edges: Array<ComposableKnowledgeEdge & { id: string }> = [];
  let rootId = "";
  let section: "objectives" | "document" | null = null;
  let documentId = "";
  let documentOrder = 0;
  let objectiveOrder = 0;
  const stack: Array<{ indent: number; id: string }> = [];
  const childCounts = new Map<string, number>();

  const ensureNodeCapacity = (lineNumber: number) => {
    if (nodes.length >= MAX_KNOWLEDGE_MAP_NODES) throw new KnowledgeMapTextError(`节点不能超过 ${MAX_KNOWLEDGE_MAP_NODES} 个`, lineNumber);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index];
    if (!raw.trim()) continue;
    const rootMatch = raw.match(/^#\s+(.+)$/);
    if (rootMatch) {
      if (rootId) throw new KnowledgeMapTextError("只能有一个课程标题", lineNumber);
      ensureNodeCapacity(lineNumber);
      rootId = randomUUID();
      nodes.push({ id: rootId, label: rootMatch[1].trim(), type: "course", summary: null, order: 0 });
      continue;
    }
    if (!rootId) throw new KnowledgeMapTextError("第一项必须是“# 课程名称”", lineNumber);
    if (/^##\s+综合目标\s*$/.test(raw)) {
      section = "objectives";
      documentId = "";
      stack.length = 0;
      continue;
    }
    const documentMatch = raw.match(/^##\s+文档[：:]\s*(.+)$/);
    if (documentMatch) {
      section = "document";
      documentOrder += 1;
      ensureNodeCapacity(lineNumber);
      documentId = randomUUID();
      nodes.push({ id: documentId, label: documentMatch[1].trim(), type: "document", summary: null, order: documentOrder });
      edges.push({ id: randomUUID(), sourceId: rootId, targetId: documentId, type: "contains", label: "来源文档" });
      stack.length = 0;
      continue;
    }
    if (section === "objectives") {
      const objective = raw.match(/^\s*-\s+(.+)$/);
      if (!objective) throw new KnowledgeMapTextError("综合目标应使用“- 目标内容”", lineNumber);
      objectiveOrder += 1;
      ensureNodeCapacity(lineNumber);
      const id = randomUUID();
      nodes.push({ id, label: objective[1].trim(), type: "objective", summary: null, order: objectiveOrder });
      edges.push({ id: randomUUID(), sourceId: rootId, targetId: id, type: "outcome", label: "综合目标" });
      continue;
    }
    if (section !== "document" || !documentId) throw new KnowledgeMapTextError("内容必须放在综合目标或文档标题下面", lineNumber);
    const item = raw.match(/^(\s*)-\s+\[([^\]]+)\]\s+(.+)$/);
    if (!item) throw new KnowledgeMapTextError("文档节点应使用“- [章节] 内容”格式", lineNumber);
    if (item[1].length % 2 !== 0) throw new KnowledgeMapTextError("层级缩进必须使用偶数个空格", lineNumber);
    const indent = item[1].length / 2;
    if (indent > MAX_KNOWLEDGE_MAP_DEPTH) throw new KnowledgeMapTextError(`层级不能超过 ${MAX_KNOWLEDGE_MAP_DEPTH} 层`, lineNumber);
    const type = typesByLabel.get(item[2].trim());
    if (!type) throw new KnowledgeMapTextError(`不支持节点类型“${item[2].trim()}”`, lineNumber);
    if (indent > stack.length) throw new KnowledgeMapTextError("不能跨越层级缩进", lineNumber);
    while (stack.length > indent) stack.pop();
    const parentId = indent === 0 ? documentId : stack[indent - 1]?.id;
    if (!parentId) throw new KnowledgeMapTextError("找不到上级节点", lineNumber);
    const id = randomUUID();
    ensureNodeCapacity(lineNumber);
    const siblings = childCounts.get(parentId) ?? 0;
    childCounts.set(parentId, siblings + 1);
    nodes.push({ id, label: item[3].trim(), type, summary: null, order: siblings + 1 });
    edges.push({ id: randomUUID(), sourceId: parentId, targetId: id, type: type === "activity" ? "practice" : type === "assessment" ? "checks" : "contains", label: typeLabels[type] });
    stack[indent] = { indent, id };
    stack.length = indent + 1;
  }

  if (!rootId) throw new KnowledgeMapTextError("缺少课程标题", 1);
  if (!nodes.some((node) => node.type === "document")) throw new KnowledgeMapTextError("至少需要一个“## 文档：文件名”", Math.max(1, lines.length));
  return { nodes, edges };
}
