import { z } from "zod";
import { createJsonCompletion } from "@/lib/ai/modelClient";

export type ComposableKnowledgeNode = {
  id: string;
  label: string;
  type: string;
  summary?: string | null;
  order: number;
  metadata?: string | null;
};

export type ComposableKnowledgeEdge = {
  id?: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string | null;
  weight?: number | null;
  metadata?: string | null;
};

export type KnowledgeMapSource = {
  id: string;
  name: string;
  nodes: ComposableKnowledgeNode[];
  edges: ComposableKnowledgeEdge[];
};

const objectiveResponseSchema = z.object({
  objectives: z.array(z.string().trim().min(1).max(200)).min(1).max(12)
}).strict();

const structuralEdgeTypes = new Set(["outcome", "contains", "practice", "checks"]);

function sanitizeObjective(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/^(?:#{1,6}|[-*+]>?)\s*/g, "").replace(/\s+/g, " ").trim();
}

function normalizeObjective(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s，。；、,.!！?？:：()（）\-]/g, "");
}

function chineseBigrams(value: string) {
  const normalized = normalizeObjective(value);
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) grams.add(normalized.slice(index, index + 2));
  return grams;
}

function similar(left: string, right: string) {
  const leftNormalized = normalizeObjective(left);
  const rightNormalized = normalizeObjective(right);
  if (leftNormalized === rightNormalized) return true;
  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) return Math.min(leftNormalized.length, rightNormalized.length) >= 8;
  const leftGrams = chineseBigrams(left);
  const rightGrams = chineseBigrams(right);
  if (!leftGrams.size || !rightGrams.size) return false;
  let overlap = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) overlap += 1;
  return overlap / Math.max(leftGrams.size, rightGrams.size) >= 0.68;
}

export function mergeObjectivesFallback(values: string[]) {
  const merged: string[] = [];
  for (const value of values.map(sanitizeObjective).filter(Boolean)) {
    if (!merged.some((item) => similar(item, value))) merged.push(value);
  }
  return merged.slice(0, 12);
}

export function mergeSourceObjectivesFallback(sources: Array<{ objectives: string[] }>) {
  const queues = sources.map((source) => source.objectives.map(sanitizeObjective).filter(Boolean));
  const merged: string[] = [];
  for (let offset = 0; merged.length < 12 && queues.some((queue) => offset < queue.length); offset += 1) {
    for (const queue of queues) {
      const value = queue[offset];
      if (value && !merged.some((item) => similar(item, value))) merged.push(value);
      if (merged.length === 12) break;
    }
  }
  return merged;
}

function objectiveIsSupported(value: string, sourceValues: string[]) {
  const normalized = normalizeObjective(value);
  if (normalized.length < 2) return false;
  return sourceValues.some((source) => {
    const sourceNormalized = normalizeObjective(source);
    if (sourceNormalized.includes(normalized) || normalized.includes(sourceNormalized)) return true;
    const resultGrams = chineseBigrams(value);
    const sourceGrams = chineseBigrams(source);
    let overlap = 0;
    for (const gram of resultGrams) if (sourceGrams.has(gram)) overlap += 1;
    return overlap >= Math.min(2, resultGrams.size) && overlap / Math.max(1, resultGrams.size) >= 0.25;
  });
}

export async function synthesizeSharedObjectives(
  sources: Array<{ name: string; objectives: string[] }>,
  complete = createJsonCompletion
) {
  const fallback = mergeSourceObjectivesFallback(sources);
  if (sources.length < 2 || !fallback.length) return fallback;
  try {
    const output = await complete({
      system: [
        "你是课程目标归纳器。",
        "将多份文档的学习目标语义去重并归纳为共同的综合目标，不做严格交集。",
        "不得添加来源目标无法支持的新要求。",
        "只返回 JSON：{\"objectives\":[\"目标\"]}，最多 12 项。"
      ].join("\n"),
      user: JSON.stringify({ documents: sources }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!output) return fallback;
    const sourceValues = sources.flatMap((source) => source.objectives).map(sanitizeObjective).filter(Boolean);
    const parsed = objectiveResponseSchema.parse(JSON.parse(output)).objectives.map(sanitizeObjective);
    const validated = mergeObjectivesFallback(parsed.filter((objective) => objectiveIsSupported(objective, sourceValues)));
    return validated.length ? validated : fallback;
  } catch {
    return fallback;
  }
}

function objectivesFor(source: KnowledgeMapSource) {
  return source.nodes.filter((node) => node.type === "objective").sort((a, b) => a.order - b.order).map((node) => node.label);
}

export function composeKnowledgeMap(input: {
  courseTitle: string;
  sources: KnowledgeMapSource[];
  objectives: string[];
}) {
  const rootId = "composite:course";
  const nodes: ComposableKnowledgeNode[] = [{ id: rootId, label: input.courseTitle, type: "course", summary: null, order: 0 }];
  const edges: Array<ComposableKnowledgeEdge & { id: string }> = [];

  input.objectives.forEach((label, index) => {
    const id = `composite:objective:${index + 1}`;
    nodes.push({ id, label, type: "objective", summary: `综合所选文档形成的学习目标：${label}`, order: index + 1 });
    edges.push({ id: `edge:${rootId}:${id}`, sourceId: rootId, targetId: id, type: "outcome", label: "综合目标" });
  });

  input.sources.forEach((source, sourceIndex) => {
    const documentId = `composite:document:${source.id}`;
    nodes.push({ id: documentId, label: source.name, type: "document", summary: `来源文档：${source.name}`, order: sourceIndex + 1 });
    edges.push({ id: `edge:${rootId}:${documentId}`, sourceId: rootId, targetId: documentId, type: "contains", label: "来源文档" });

    const originalRoot = source.nodes.find((node) => node.type === "course") ?? source.nodes[0];
    const includedNodes = source.nodes.filter((node) => node.id !== originalRoot?.id && node.type !== "objective");
    const clonedId = new Map(includedNodes.map((node) => [node.id, `composite:${source.id}:${node.id}`]));
    for (const node of includedNodes) nodes.push({ ...node, id: clonedId.get(node.id)! });

    const parented = new Set<string>();
    for (const edge of source.edges) {
      if (!structuralEdgeTypes.has(edge.type)) continue;
      const targetId = clonedId.get(edge.targetId);
      if (!targetId) continue;
      const sourceId = clonedId.get(edge.sourceId);
      if (sourceId) {
        edges.push({ id: `edge:${source.id}:${edge.sourceId}:${edge.targetId}`, sourceId, targetId, type: edge.type, label: edge.label, weight: edge.weight, metadata: edge.metadata });
        parented.add(edge.targetId);
      } else if (edge.sourceId === originalRoot?.id) {
        edges.push({ id: `edge:${documentId}:${targetId}`, sourceId: documentId, targetId, type: "contains", label: edge.label ?? "文档内容", weight: edge.weight, metadata: edge.metadata });
        parented.add(edge.targetId);
      }
    }
    for (const node of includedNodes) {
      if (parented.has(node.id)) continue;
      const targetId = clonedId.get(node.id)!;
      edges.push({ id: `edge:${documentId}:${targetId}`, sourceId: documentId, targetId, type: "contains", label: "文档内容" });
    }
    for (const edge of source.edges) {
      if (structuralEdgeTypes.has(edge.type)) continue;
      const sourceId = clonedId.get(edge.sourceId);
      const targetId = clonedId.get(edge.targetId);
      if (!sourceId || !targetId) continue;
      edges.push({ id: `edge:${source.id}:${edge.sourceId}:${edge.targetId}`, sourceId, targetId, type: edge.type, label: edge.label, weight: edge.weight, metadata: edge.metadata });
    }
  });

  return { nodes, edges };
}

export function sourceObjectives(sources: KnowledgeMapSource[]) {
  return sources.map((source) => ({ name: source.name, objectives: objectivesFor(source) }));
}

export function selectionKey(mapIds: string[]) {
  return mapIds.slice().sort().join("|");
}
