import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  composeKnowledgeMap,
  mergeSourceObjectivesFallback,
  selectionKey,
  sourceObjectives,
  synthesizeSharedObjectives,
  type KnowledgeMapSource
} from "@/lib/knowledgeMap/knowledgeMapComposite";
import { mergeKnowledgeMapMetadata, parseKnowledgeMapText, serializeKnowledgeMapText } from "@/lib/knowledgeMap/knowledgeMapText";

const mapInclude = {
  sourceJob: { select: { id: true, originalName: true } },
  nodes: { orderBy: [{ type: "asc" as const }, { order: "asc" as const }, { createdAt: "asc" as const }] },
  edges: { orderBy: { createdAt: "asc" as const } }
};

export const PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES = ["READY_FOR_REVIEW", "APPLIED"];

export function knowledgeMapSourcesMatch(serializedSourceMapIds: string | null, requestedMapIds: string[]) {
  if (!serializedSourceMapIds) return false;
  try {
    const saved = JSON.parse(serializedSourceMapIds) as unknown;
    if (!Array.isArray(saved) || saved.some((id) => typeof id !== "string")) return false;
    return selectionKey(saved) === selectionKey(requestedMapIds);
  } catch {
    return false;
  }
}

export function nextKnowledgeMapVersion(latestVersion: number | null | undefined) {
  return Math.max(0, latestVersion ?? 0) + 1;
}

type Graph = ReturnType<typeof composeKnowledgeMap>;
type PersistedMap = Awaited<ReturnType<typeof persistPublishedMap>>;
const compositeBuilds = new Map<string, Promise<PersistedMap>>();

function unwrapSingleDocumentGraph(graph: Graph) {
  const root = graph.nodes.find((node) => node.type === "course");
  const document = graph.nodes.find((node) => node.type === "document");
  if (!root || !document) return graph;
  const documentChildren = graph.edges.filter((edge) => edge.sourceId === document.id).map((edge) => edge.targetId);
  return {
    nodes: graph.nodes.filter((node) => node.id !== document.id),
    edges: [
      ...graph.edges.filter((edge) => edge.sourceId !== document.id && edge.targetId !== document.id),
      ...documentChildren.map((targetId, index) => ({
        id: randomUUID(),
        sourceId: root.id,
        targetId,
        type: "contains",
        label: index === 0 ? "文档内容" : null
      }))
    ]
  };
}

function remapGraph(graph: Graph) {
  const ids = new Map(graph.nodes.map((node) => [node.id, randomUUID()]));
  return {
    nodes: graph.nodes.map((node) => ({ ...node, id: ids.get(node.id)! })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      id: randomUUID(),
      sourceId: ids.get(edge.sourceId)!,
      targetId: ids.get(edge.targetId)!
    }))
  };
}

async function persistPublishedMap(input: {
  courseId: string;
  sourceJobId?: string | null;
  selectionKey?: string | null;
  sourceMapIds?: string[];
  title: string;
  summary?: string | null;
  version: number;
  graph: Graph;
  textContent?: string;
  tx?: Prisma.TransactionClient | typeof db;
}) {
  const tx = input.tx ?? db;
  const graph = remapGraph(input.graph);
  const map = await tx.courseKnowledgeMap.create({
    data: {
      courseId: input.courseId,
      sourceJobId: input.sourceJobId ?? null,
      selectionKey: input.selectionKey ?? null,
      sourceMapIds: input.sourceMapIds ? JSON.stringify(input.sourceMapIds) : null,
      title: input.title,
      summary: input.summary ?? null,
      status: "PUBLISHED",
      version: input.version,
      publishedAt: new Date(),
      textContent: input.textContent ?? serializeKnowledgeMapText(graph.nodes, graph.edges)
    }
  });
  await tx.knowledgeNode.createMany({ data: graph.nodes.map((node) => ({ ...node, mapId: map.id })) });
  await tx.knowledgeEdge.createMany({
    data: graph.edges.map(({ id: _id, ...edge }) => ({ ...edge, mapId: map.id }))
  });
  return tx.courseKnowledgeMap.findUniqueOrThrow({ where: { id: map.id }, include: mapInclude });
}

/**
 * Copies a published source map for a new import job without rebuilding it.
 * This is used when the same document content is imported again: the graph,
 * text representation and node metadata remain identical while the new job
 * gets its own visible source-map series.
 */
export async function clonePublishedKnowledgeMap(input: {
  courseId: string;
  sourceMapId: string;
  sourceJobId: string;
}) {
  return db.$transaction(async (tx) => {
    const source = await tx.courseKnowledgeMap.findFirst({
      where: { id: input.sourceMapId, courseId: input.courseId, status: "PUBLISHED", deletedAt: null },
      include: { nodes: true, edges: true }
    });
    if (!source) throw new Error("可复用的知识图谱不存在或已删除");
    const latest = await tx.courseKnowledgeMap.findFirst({
      where: { courseId: input.courseId, sourceJobId: input.sourceJobId },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const map = await tx.courseKnowledgeMap.create({
      data: {
        courseId: input.courseId,
        sourceJobId: input.sourceJobId,
        title: source.title,
        summary: source.summary,
        status: "PUBLISHED",
        version: nextKnowledgeMapVersion(latest?.version),
        publishedAt: new Date(),
        textContent: source.textContent
      }
    });
    const nodeIds = new Map<string, string>();
    for (const node of source.nodes) {
      const id = randomUUID();
      nodeIds.set(node.id, id);
      await tx.knowledgeNode.create({
        data: {
          id,
          mapId: map.id,
          label: node.label,
          type: node.type,
          summary: node.summary,
          order: node.order,
          metadata: node.metadata
        }
      });
    }
    await tx.knowledgeEdge.createMany({
      data: source.edges.map((edge) => ({
        mapId: map.id,
        sourceId: nodeIds.get(edge.sourceId)!,
        targetId: nodeIds.get(edge.targetId)!,
        type: edge.type,
        label: edge.label,
        weight: edge.weight,
        metadata: edge.metadata
      }))
    });
    return tx.courseKnowledgeMap.findUniqueOrThrow({ where: { id: map.id }, include: mapInclude });
  });
}

function toSource(map: {
  id: string;
  sourceJob: { originalName: string } | null;
  nodes: Array<{ id: string; label: string; type: string; summary: string | null; order: number; metadata: string | null }>;
  edges: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string | null; weight: number | null; metadata: string | null }>;
}): KnowledgeMapSource {
  return {
    id: map.id,
    name: map.sourceJob?.originalName ?? map.nodes.find((node) => node.type === "document")?.label ?? "课程文档",
    nodes: map.nodes,
    edges: map.edges
  };
}

export async function composePublishedKnowledgeMaps(input: {
  courseId: string;
  courseTitle: string;
  mapIds: string[];
  persist: boolean;
}) {
  const uniqueMapIds = [...new Set(input.mapIds)].slice(0, 20);
  if (!uniqueMapIds.length) throw new Error("请至少选择一份课程文档");
  const rows = await db.courseKnowledgeMap.findMany({
    where: {
      id: { in: uniqueMapIds },
      courseId: input.courseId,
      sourceJobId: { not: null },
      sourceJob: { deletedAt: null, status: { in: PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } },
      status: "PUBLISHED",
      deletedAt: null
    },
    include: mapInclude
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const maps = uniqueMapIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (maps.length !== uniqueMapIds.length) throw new Error("所选知识图谱不存在或尚未发布");
  if (new Set(maps.map((map) => map.sourceJobId)).size !== maps.length) throw new Error("同一文档不能重复选择多个版本");
  const sourceJobIds = maps.map((map) => map.sourceJobId!);
  const latestRows = await db.courseKnowledgeMap.findMany({
    where: { courseId: input.courseId, sourceJobId: { in: sourceJobIds }, status: "PUBLISHED", deletedAt: null },
    orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
    select: { id: true, sourceJobId: true }
  });
  const latestBySource = new Map<string, string>();
  for (const row of latestRows) if (row.sourceJobId && !latestBySource.has(row.sourceJobId)) latestBySource.set(row.sourceJobId, row.id);
  if (maps.some((map) => latestBySource.get(map.sourceJobId!) !== map.id)) throw new Error("所选知识图谱已有新版本，请刷新后重试");
  const key = selectionKey(sourceJobIds);
  if (maps.length > 1) {
    const existing = await db.courseKnowledgeMap.findFirst({
      where: { courseId: input.courseId, selectionKey: key, status: "PUBLISHED", deletedAt: null },
      orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
      include: mapInclude
    });
    if (existing && knowledgeMapSourcesMatch(existing.sourceMapIds, uniqueMapIds)) return { map: existing, persisted: true };
  }
  const sources = maps.map(toSource);
  const objectiveSources = sourceObjectives(sources);
  if (!input.persist || maps.length === 1) {
    const objectives = mergeSourceObjectivesFallback(objectiveSources);
    const graph = composeKnowledgeMap({ courseTitle: input.courseTitle, sources, objectives });
    const textContent = serializeKnowledgeMapText(graph.nodes, graph.edges);
    return {
      persisted: false,
      map: {
        id: `preview:${key}`,
        courseId: input.courseId,
        sourceJobId: maps[0]?.sourceJobId ?? null,
        sourceJob: maps[0]?.sourceJob ?? null,
        selectionKey: maps.length > 1 ? key : null,
        sourceMapIds: JSON.stringify(uniqueMapIds),
        title: maps.length > 1 ? `${maps.length} 份文档综合知识图谱` : `${sources[0].name} 知识图谱`,
        summary: maps.length > 1 ? "综合所选文档的共同目标与各自知识结构。" : maps[0]?.summary ?? null,
        status: "PUBLISHED",
        version: maps[0]?.version ?? 1,
        publishedAt: maps[0]?.publishedAt ?? new Date(),
        textContent,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: graph.nodes,
        edges: graph.edges
      }
    };
  }
  const flightId = `${input.courseId}:${key}:${selectionKey(uniqueMapIds)}`;
  let build = compositeBuilds.get(flightId);
  if (!build) {
    build = (async () => {
      const objectives = await synthesizeSharedObjectives(objectiveSources);
      const graph = composeKnowledgeMap({ courseTitle: input.courseTitle, sources, objectives });
      const textContent = serializeKnowledgeMapText(graph.nodes, graph.edges);
      return db.$transaction(async (tx) => {
        const currentSources = await tx.courseKnowledgeMap.findMany({
          where: {
            id: { in: uniqueMapIds },
            courseId: input.courseId,
            sourceJobId: { not: null },
            sourceJob: { deletedAt: null, status: { in: PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } },
            status: "PUBLISHED",
            deletedAt: null
          },
          select: { id: true, sourceJobId: true }
        });
        if (currentSources.length !== uniqueMapIds.length) throw new Error("所选知识图谱已被更新或删除，请刷新后重试");
        const currentSourceJobIds = currentSources.map((map) => map.sourceJobId!);
        const newestSources = await tx.courseKnowledgeMap.findMany({
          where: { courseId: input.courseId, sourceJobId: { in: currentSourceJobIds }, status: "PUBLISHED", deletedAt: null },
          orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
          select: { id: true, sourceJobId: true }
        });
        const newestBySource = new Map<string, string>();
        for (const map of newestSources) if (map.sourceJobId && !newestBySource.has(map.sourceJobId)) newestBySource.set(map.sourceJobId, map.id);
        if (currentSources.some((map) => newestBySource.get(map.sourceJobId!) !== map.id)) throw new Error("所选知识图谱已有新版本，请刷新后重试");
        const latest = await tx.courseKnowledgeMap.findFirst({
          where: { courseId: input.courseId, selectionKey: key },
          orderBy: { version: "desc" },
          select: { version: true }
        });
        return persistPublishedMap({
          courseId: input.courseId,
          selectionKey: key,
          sourceMapIds: uniqueMapIds,
          title: `${maps.length} 份文档综合知识图谱`,
          summary: "综合所选文档的共同目标与各自知识结构。",
          version: nextKnowledgeMapVersion(latest?.version),
          graph,
          textContent,
          tx
        });
      });
    })();
    compositeBuilds.set(flightId, build);
  }
  let map: PersistedMap;
  try {
    map = await build;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    map = await db.courseKnowledgeMap.findFirstOrThrow({
      where: { courseId: input.courseId, selectionKey: key, status: "PUBLISHED", deletedAt: null },
      orderBy: { version: "desc" },
      include: mapInclude
    });
    if (!knowledgeMapSourcesMatch(map.sourceMapIds, uniqueMapIds)) throw new Error("组合图谱已被更新，请刷新后重试");
  } finally {
    if (compositeBuilds.get(flightId) === build) compositeBuilds.delete(flightId);
  }
  return { map, persisted: true };
}

export async function saveKnowledgeMapTextRevision(input: {
  courseId: string;
  mapId: string;
  text: string;
  expectedVersion: number;
}) {
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.courseKnowledgeMap.findFirst({
        where: { id: input.mapId, courseId: input.courseId, status: "PUBLISHED", deletedAt: null },
        include: mapInclude
      });
      if (!current) throw new Error("知识图谱不存在或已删除");
      const seriesWhere = current.selectionKey
        ? { courseId: input.courseId, selectionKey: current.selectionKey, deletedAt: null }
        : current.sourceJobId
          ? { courseId: input.courseId, sourceJobId: current.sourceJobId, deletedAt: null }
          : { courseId: input.courseId, id: current.id, deletedAt: null };
      const latest = await tx.courseKnowledgeMap.findFirst({ where: seriesWhere, orderBy: { version: "desc" }, select: { id: true, version: true } });
      if (!latest || latest.id !== current.id || latest.version !== input.expectedVersion) throw new Error("图谱已被更新，请刷新后再编辑");
      const parsed = parseKnowledgeMapText(input.text);
      const editedGraph = current.sourceJobId && !current.selectionKey ? unwrapSingleDocumentGraph(parsed) : parsed;
      const graph = mergeKnowledgeMapMetadata(current.nodes, current.edges, editedGraph.nodes, editedGraph.edges);
      return persistPublishedMap({
        courseId: input.courseId,
        sourceJobId: current.sourceJobId,
        selectionKey: current.selectionKey,
        sourceMapIds: current.sourceMapIds ? JSON.parse(current.sourceMapIds) as string[] : undefined,
        title: `${parsed.nodes.find((node) => node.type === "course")?.label ?? current.title} 知识图谱`,
        summary: current.summary,
        version: current.version + 1,
        graph,
        textContent: input.text,
        tx
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("图谱已被更新，请刷新后再编辑");
    }
    throw error;
  }
}

export async function softDeleteKnowledgeMapSeries(courseId: string, mapId: string) {
  const current = await db.courseKnowledgeMap.findFirst({ where: { id: mapId, courseId, deletedAt: null }, select: { sourceJobId: true, selectionKey: true } });
  if (!current) throw new Error("知识图谱不存在或已删除");
  const where = current.selectionKey
    ? { courseId, selectionKey: current.selectionKey, deletedAt: null }
    : current.sourceJobId
      ? { courseId, sourceJobId: current.sourceJobId, deletedAt: null }
      : { courseId, id: mapId, deletedAt: null };
  return db.courseKnowledgeMap.updateMany({ where, data: { deletedAt: new Date() } });
}

export { mapInclude };
