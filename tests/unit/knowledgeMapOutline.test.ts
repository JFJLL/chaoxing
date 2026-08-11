import { describe, expect, it } from "vitest";
import { buildKnowledgeOutline, outlineToGraph, reorderTreeChildren, serializeKnowledgeOutline, type KnowledgeOutlineNode } from "@/lib/knowledgeMap/knowledgeMapOutline";
import { parseKnowledgeMapText, serializeKnowledgeMapText } from "@/lib/knowledgeMap/knowledgeMapText";

const nodes = [
  { id: "course", label: "数字阅读服务", type: "course", order: 0 },
  { id: "objective", label: "识别读者需求", type: "objective", order: 0 },
  { id: "document", label: "第一章 服务认知.pptx", type: "document", order: 1 },
  { id: "chapter", label: "服务认知", type: "chapter", order: 1 },
  { id: "lesson", label: "读者需求分析", type: "lesson", order: 1 },
  { id: "concept", label: "用户画像", type: "concept", order: 1 },
  { id: "activity", label: "画像工作坊", type: "activity", order: 2 },
  { id: "assessment", label: "课堂检测", type: "assessment", order: 3 }
];

const edges = [
  { id: "e1", sourceId: "course", targetId: "objective", type: "outcome" },
  { id: "e2", sourceId: "course", targetId: "document", type: "contains" },
  { id: "e3", sourceId: "document", targetId: "chapter", type: "contains" },
  { id: "e4", sourceId: "chapter", targetId: "lesson", type: "contains" },
  { id: "e5", sourceId: "lesson", targetId: "concept", type: "contains" },
  { id: "e6", sourceId: "lesson", targetId: "activity", type: "practice" },
  { id: "e7", sourceId: "lesson", targetId: "assessment", type: "checks" },
  { id: "e8", sourceId: "concept", targetId: "activity", type: "applies" }
];

describe("knowledge outline", () => {
  it("builds the editable tree with objectives and documents under the course", () => {
    const tree = buildKnowledgeOutline(nodes, edges)!;
    expect(tree.type).toBe("course");
    expect(tree.children.map((child) => child.type)).toEqual(["objective", "document"]);
    const document = tree.children[1]!;
    expect(document.children.map((child) => child.id)).toEqual(["chapter"]);
    const chapter = document.children[0]!;
    expect(chapter.children.map((child) => child.id)).toEqual(["lesson"]);
    expect(chapter.children[0]!.children.map((child) => child.id)).toEqual(["concept", "activity", "assessment"]);
  });

  it("returns null when the graph has no root", () => {
    expect(buildKnowledgeOutline([], [])).toBeNull();
  });

  it("serializes to exactly the same text as the server serializer", () => {
    const tree = buildKnowledgeOutline(nodes, edges)!;
    expect(serializeKnowledgeOutline(tree)).toBe(serializeKnowledgeMapText(nodes, edges));
  });

  it("round-trips through the server parser without losing structure", () => {
    const tree = buildKnowledgeOutline(nodes, edges)!;
    const text = serializeKnowledgeOutline(tree);
    const parsed = parseKnowledgeMapText(text);
    expect(parsed.nodes).toHaveLength(nodes.length);
    expect(parsed.edges).toHaveLength(nodes.length - 1);
    const byId = new Map(parsed.nodes.map((node) => [node.label, node]));
    expect(byId.get("识别读者需求")?.type).toBe("objective");
    expect(byId.get("用户画像")?.type).toBe("concept");
    expect(byId.get("画像工作坊")?.type).toBe("activity");
  });

  it("emits a placeholder objective and still parses when objectives are empty", () => {
    const tree = buildKnowledgeOutline(nodes.filter((node) => node.type !== "objective"), edges.filter((edge) => edge.type !== "outcome"))!;
    const text = serializeKnowledgeOutline(tree);
    expect(text).toContain("- 待补充课程目标");
    const parsed = parseKnowledgeMapText(text);
    expect(parsed.nodes.some((node) => node.type === "objective")).toBe(true);
  });

  it("preview graph keeps structural edge kinds used by the renderer", () => {
    const tree = buildKnowledgeOutline(nodes, edges)!;
    const graph = outlineToGraph(tree);
    expect(graph.nodes.map((node) => node.id)).toEqual(["course", "objective", "document", "chapter", "lesson", "concept", "activity", "assessment"]);
    const edgeFor = (targetId: string) => graph.edges.find((edge) => edge.targetId === targetId)?.type;
    expect(edgeFor("objective")).toBe("outcome");
    expect(edgeFor("document")).toBe("contains");
    expect(edgeFor("activity")).toBe("practice");
    expect(edgeFor("assessment")).toBe("checks");
    expect(edgeFor("lesson")).toBe("contains");
  });

  it("reorders nodes inside an unfiltered sibling list", () => {
    const tree = buildKnowledgeOutline(nodes, edges)!;
    const document = tree.children.find((child) => child.type === "document")!;
    const lesson = document.children[0]!.children.find((child) => child.id === "lesson")!;
    const next = reorderTreeChildren(lesson.children, "concept", () => true, 2);
    expect(next.map((child) => child.id)).toEqual(["activity", "assessment", "concept"]);
  });

  it("reorders grouped siblings while keeping other groups in their slots", () => {
    const children: KnowledgeOutlineNode[] = [
      { id: "o1", type: "objective", label: "目标1", children: [] },
      { id: "d1", type: "document", label: "文档1", children: [] },
      { id: "o2", type: "objective", label: "目标2", children: [] },
      { id: "d2", type: "document", label: "文档2", children: [] }
    ];
    const isObjective = (node: KnowledgeOutlineNode) => node.type === "objective";
    const next = reorderTreeChildren(children, "o1", isObjective, 1);
    expect(next.map((child) => child.id)).toEqual(["o2", "d1", "o1", "d2"]);
    expect(next.filter(isObjective).map((child) => child.id)).toEqual(["o2", "o1"]);
    expect(next.filter((child) => child.type === "document").map((child) => child.id)).toEqual(["d1", "d2"]);
  });
});
