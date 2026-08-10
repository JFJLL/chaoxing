import { describe, expect, it } from "vitest";
import {
  composeKnowledgeMap,
  mergeObjectivesFallback,
  mergeSourceObjectivesFallback,
  synthesizeSharedObjectives,
  type KnowledgeMapSource
} from "@/lib/knowledgeMap/knowledgeMapComposite";
import { KnowledgeMapTextError, mergeKnowledgeMapMetadata, parseKnowledgeMapText, serializeKnowledgeMapText } from "@/lib/knowledgeMap/knowledgeMapText";
import {
  knowledgeMapSourcesMatch,
  nextKnowledgeMapVersion,
  PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES
} from "@/lib/knowledgeMap/knowledgeMapService";

const source = (id: string, name: string, objective: string): KnowledgeMapSource => ({
  id,
  name,
  nodes: [
    { id: `${id}-root`, label: name, type: "course", order: 0 },
    { id: `${id}-objective`, label: objective, type: "objective", order: 1 },
    { id: `${id}-chapter`, label: `${name}章节`, type: "chapter", order: 1 }
  ],
  edges: [
    { id: `${id}-outcome`, sourceId: `${id}-root`, targetId: `${id}-objective`, type: "outcome" },
    { id: `${id}-contains`, sourceId: `${id}-root`, targetId: `${id}-chapter`, type: "contains" }
  ]
});

describe("knowledge map composites", () => {
  it("keeps automatically published maps visible before and after course-document confirmation", () => {
    expect(PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES).toEqual(["READY_FOR_REVIEW", "APPLIED"]);
  });

  it("rebuilds a composite when a source map version changes", () => {
    expect(knowledgeMapSourcesMatch(JSON.stringify(["map-a-v1", "map-b-v1"]), ["map-b-v1", "map-a-v1"])).toBe(true);
    expect(knowledgeMapSourcesMatch(JSON.stringify(["map-a-v1", "map-b-v1"]), ["map-a-v2", "map-b-v1"])).toBe(false);
  });

  it("increments composite versions after updates or soft deletion", () => {
    expect(nextKnowledgeMapVersion(null)).toBe(1);
    expect(nextKnowledgeMapVersion(1)).toBe(2);
  });

  it("preserves summaries, metadata, weights, and cross-links through text editing", () => {
    const currentNodes = [
      { id: "root", label: "课程", type: "course", summary: "课程说明", order: 0, metadata: "root-meta" },
      { id: "doc", label: "讲义", type: "document", summary: "文档说明", order: 1, metadata: "doc-meta" },
      { id: "a", label: "概念甲", type: "concept", summary: "甲说明", order: 1, metadata: "a-meta" },
      { id: "b", label: "概念乙", type: "concept", summary: "乙说明", order: 2, metadata: "b-meta" }
    ];
    const currentEdges = [
      { id: "root-doc", sourceId: "root", targetId: "doc", type: "contains", label: "来源", weight: 0.9, metadata: "edge-meta" },
      { id: "doc-a", sourceId: "doc", targetId: "a", type: "contains", label: "概念", weight: 0.8 },
      { id: "doc-b", sourceId: "doc", targetId: "b", type: "contains", label: "概念", weight: 0.7 },
      { id: "a-b", sourceId: "a", targetId: "b", type: "relates", label: "递进", weight: 0.4, metadata: "relation-meta" }
    ];
    const parsed = parseKnowledgeMapText(serializeKnowledgeMapText(currentNodes, currentEdges).replace("概念甲", "概念甲（已编辑）"));
    const merged = mergeKnowledgeMapMetadata(currentNodes, currentEdges, parsed.nodes, parsed.edges);

    expect(merged.nodes.find((node) => node.label.includes("已编辑"))).toMatchObject({ summary: "甲说明", metadata: "a-meta" });
    expect(merged.edges.find((edge) => edge.type === "relates")).toMatchObject({ label: "递进", weight: 0.4, metadata: "relation-meta" });
    expect(merged.edges.find((edge) => edge.sourceId === merged.nodes[0]!.id && edge.type === "contains")).toMatchObject({ weight: 0.9, metadata: "edge-meta" });
  });

  it("does not shift metadata or cross-links when a sibling is inserted", () => {
    const currentNodes = [
      { id: "root", label: "课程", type: "course", order: 0 },
      { id: "doc", label: "讲义", type: "document", order: 1 },
      { id: "a", label: "概念甲", type: "concept", summary: "甲说明", order: 1, metadata: "meta-a" },
      { id: "b", label: "概念乙", type: "concept", summary: "乙说明", order: 2, metadata: "meta-b" }
    ];
    const currentEdges = [
      { id: "root-doc", sourceId: "root", targetId: "doc", type: "contains" },
      { id: "doc-a", sourceId: "doc", targetId: "a", type: "contains" },
      { id: "doc-b", sourceId: "doc", targetId: "b", type: "contains" },
      { id: "a-b", sourceId: "a", targetId: "b", type: "relates", label: "递进" }
    ];
    const editedText = serializeKnowledgeMapText(currentNodes, currentEdges).replace(
      "- [概念] 概念甲",
      "- [概念] 新概念\n- [概念] 概念甲"
    );
    const parsed = parseKnowledgeMapText(editedText);
    const merged = mergeKnowledgeMapMetadata(currentNodes, currentEdges, parsed.nodes, parsed.edges);
    const byLabel = new Map(merged.nodes.map((node) => [node.label, node]));
    const relation = merged.edges.find((edge) => edge.type === "relates");

    expect(byLabel.get("新概念")?.metadata).toBeUndefined();
    expect(byLabel.get("概念甲")).toMatchObject({ summary: "甲说明", metadata: "meta-a" });
    expect(byLabel.get("概念乙")).toMatchObject({ summary: "乙说明", metadata: "meta-b" });
    expect(relation).toMatchObject({ sourceId: byLabel.get("概念甲")?.id, targetId: byLabel.get("概念乙")?.id });
  });

  it("does not guess hidden metadata when duplicate sibling branches are reordered", () => {
    const currentNodes = [
      { id: "root", label: "课程", type: "course", order: 0 },
      { id: "doc", label: "讲义", type: "document", order: 1 },
      { id: "chapter-a", label: "同名章节", type: "chapter", order: 1 },
      { id: "chapter-b", label: "同名章节", type: "chapter", order: 2 },
      { id: "concept-a", label: "甲分支", type: "concept", order: 1, metadata: "meta-a" },
      { id: "concept-b", label: "乙分支", type: "concept", order: 1, metadata: "meta-b" }
    ];
    const currentEdges = [
      { id: "root-doc", sourceId: "root", targetId: "doc", type: "contains" },
      { id: "doc-a", sourceId: "doc", targetId: "chapter-a", type: "contains" },
      { id: "doc-b", sourceId: "doc", targetId: "chapter-b", type: "contains" },
      { id: "a-child", sourceId: "chapter-a", targetId: "concept-a", type: "contains" },
      { id: "b-child", sourceId: "chapter-b", targetId: "concept-b", type: "contains" },
      { id: "cross", sourceId: "concept-a", targetId: "concept-b", type: "relates", metadata: "cross-meta" }
    ];
    const edited = parseKnowledgeMapText([
      "# 课程", "", "## 综合目标", "- 目标", "", "## 文档：讲义",
      "- [章节] 同名章节", "  - [概念] 乙分支",
      "- [章节] 同名章节", "  - [概念] 甲分支"
    ].join("\n"));
    const merged = mergeKnowledgeMapMetadata(currentNodes, currentEdges, edited.nodes, edited.edges);

    expect(merged.nodes.find((node) => node.label === "甲分支")?.metadata).toBeUndefined();
    expect(merged.nodes.find((node) => node.label === "乙分支")?.metadata).toBeUndefined();
    expect(merged.edges.some((edge) => edge.type === "relates")).toBe(false);
  });

  it("does not guess identities when multiple siblings are renamed and reordered together", () => {
    const currentNodes = [
      { id: "root", label: "课程", type: "course", order: 0 },
      { id: "doc", label: "讲义", type: "document", order: 1 },
      { id: "a", label: "概念甲", type: "concept", order: 1, metadata: "meta-a" },
      { id: "b", label: "概念乙", type: "concept", order: 2, metadata: "meta-b" }
    ];
    const currentEdges = [
      { id: "root-doc", sourceId: "root", targetId: "doc", type: "contains" },
      { id: "doc-a", sourceId: "doc", targetId: "a", type: "contains" },
      { id: "doc-b", sourceId: "doc", targetId: "b", type: "contains" },
      { id: "a-b", sourceId: "a", targetId: "b", type: "relates", metadata: "cross-meta" }
    ];
    const edited = parseKnowledgeMapText([
      "# 课程", "", "## 综合目标", "- 目标", "", "## 文档：讲义",
      "- [概念] 概念乙（新版）", "- [概念] 概念甲（新版）"
    ].join("\n"));
    const merged = mergeKnowledgeMapMetadata(currentNodes, currentEdges, edited.nodes, edited.edges);

    expect(merged.nodes.filter((node) => node.type === "concept").every((node) => node.metadata === undefined)).toBe(true);
    expect(merged.edges.some((edge) => edge.type === "relates")).toBe(false);
  });

  it("rejects oversized text graphs before parsing becomes expensive", () => {
    const rows = Array.from({ length: 2_001 }, (_, index) => `- [概念] 节点${index + 1}`).join("\n");
    expect(() => parseKnowledgeMapText(`# 课程\n\n## 综合目标\n- 目标\n\n## 文档：讲义\n${rows}`)).toThrow("节点不能超过 2000 个");
  });

  it("deduplicates semantically similar fallback objectives", () => {
    expect(mergeObjectivesFallback(["理解市场营销的核心概念", "理解市场营销核心概念。", "能够分析消费者行为"])).toEqual([
      "理解市场营销的核心概念",
      "能够分析消费者行为"
    ]);
  });

  it("keeps fallback coverage balanced across selected documents", () => {
    const first = Array.from({ length: 12 }, (_, index) => `第一份文档目标${index + 1}`);
    expect(mergeSourceObjectivesFallback([
      { objectives: first },
      { objectives: ["第二份文档独有目标"] }
    ])).toContain("第二份文档独有目标");
  });

  it("uses model synthesis when valid and keeps document branches separate", async () => {
    const sources = [source("a", "第一章.pdf", "理解营销概念"), source("b", "第二章.pdf", "分析消费者行为")];
    const objectives = await synthesizeSharedObjectives(
      sources.map((item) => ({ name: item.name, objectives: item.nodes.filter((node) => node.type === "objective").map((node) => node.label) })),
      async () => JSON.stringify({ objectives: ["理解营销并分析消费者行为"] })
    );
    const graph = composeKnowledgeMap({ courseTitle: "市场营销", sources, objectives });
    expect(graph.nodes.filter((node) => node.type === "objective").map((node) => node.label)).toEqual(["理解营销并分析消费者行为"]);
    expect(graph.nodes.filter((node) => node.type === "document").map((node) => node.label)).toEqual(["第一章.pdf", "第二章.pdf"]);
    for (const document of graph.nodes.filter((node) => node.type === "document")) {
      expect(graph.edges.some((edge) => edge.sourceId === "composite:course" && edge.targetId === document.id)).toBe(true);
    }
  });

  it("rejects unsupported model goals and strips markdown control lines", async () => {
    const sources = [
      { name: "A", objectives: ["理解市场营销概念"] },
      { name: "B", objectives: ["分析消费者行为"] }
    ];
    await expect(synthesizeSharedObjectives(sources, async () => JSON.stringify({ objectives: ["掌握量子力学"] })))
      .resolves.toEqual(["理解市场营销概念", "分析消费者行为"]);
    await expect(synthesizeSharedObjectives(sources, async () => JSON.stringify({ objectives: ["## 理解市场营销概念\n## 文档：恶意"] })))
      .resolves.toEqual(["理解市场营销概念 ## 文档：恶意"]);
  });

  it("round trips the constrained markdown representation", () => {
    const graph = composeKnowledgeMap({
      courseTitle: "市场营销",
      sources: [source("a", "第一章.pdf", "理解营销概念")],
      objectives: ["理解营销概念"]
    });
    const text = serializeKnowledgeMapText(graph.nodes, graph.edges);
    expect(text).toContain("## 综合目标");
    expect(text).toContain("## 文档：第一章.pdf");
    const parsed = parseKnowledgeMapText(text);
    expect(parsed.nodes.some((node) => node.type === "document" && node.label === "第一章.pdf")).toBe(true);
    expect(parsed.nodes.some((node) => node.type === "chapter" && node.label === "第一章.pdf章节")).toBe(true);
  });

  it("reports the invalid markdown line", () => {
    expect(() => parseKnowledgeMapText("# 课程\n\n## 文档：资料.pdf\n - [章节] 错误缩进")).toThrowError(KnowledgeMapTextError);
    try {
      parseKnowledgeMapText("# 课程\n\n## 文档：资料.pdf\n - [章节] 错误缩进");
    } catch (error) {
      expect((error as KnowledgeMapTextError).line).toBe(4);
    }
  });
});
