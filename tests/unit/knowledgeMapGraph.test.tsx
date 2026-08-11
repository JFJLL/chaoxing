import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  KnowledgeMapGraph,
  anchorLayoutToNode,
  buildKnowledgeMindMapLayout,
  wrapKnowledgeLabel,
  type KnowledgeEdge,
  type KnowledgeNode
} from "@/components/course-workspace/KnowledgeMapGraph";

const nodes: KnowledgeNode[] = [
  { id: "course", label: "数字阅读服务", type: "course", order: 0 },
  { id: "objective", label: "识别读者需求", type: "objective", order: 1 },
  { id: "chapter", label: "第一章 服务认知", type: "chapter", order: 1 },
  { id: "lesson", label: "读者需求分析", type: "lesson", order: 1 },
  { id: "concept", label: "用户画像", type: "concept", order: 1 },
  { id: "activity", label: "画像工作坊", type: "activity", order: 2 },
  { id: "assessment", label: "课堂检测", type: "assessment", order: 3 }
];

const edges: KnowledgeEdge[] = [
  { id: "e1", sourceId: "course", targetId: "objective", type: "outcome" },
  { id: "e2", sourceId: "course", targetId: "chapter", type: "contains" },
  { id: "e3", sourceId: "chapter", targetId: "lesson", type: "contains" },
  { id: "e4", sourceId: "lesson", targetId: "concept", type: "contains" },
  { id: "e5", sourceId: "lesson", targetId: "activity", type: "practice" },
  { id: "e6", sourceId: "lesson", targetId: "assessment", type: "checks" },
  { id: "e7", sourceId: "concept", targetId: "activity", type: "applies" },
  { id: "e8", sourceId: "assessment", targetId: "concept", type: "evaluates" }
];

describe("knowledge mind-map layout", () => {
  it("places learning objectives left and the course hierarchy right", () => {
    const layout = buildKnowledgeMindMapLayout(nodes, edges);
    const course = layout.positions.get("course")!;
    const objective = layout.positions.get("objective")!;
    const chapter = layout.positions.get("chapter")!;
    const lesson = layout.positions.get("lesson")!;
    const concept = layout.positions.get("concept")!;

    expect(objective.x).toBeLessThan(course.x);
    expect(chapter.x).toBeGreaterThan(course.x);
    expect(lesson.x).toBeGreaterThan(chapter.x);
    expect(concept.x).toBeGreaterThan(lesson.x);
    expect(layout.links).toHaveLength(6);
    expect(layout.secondaryEdgeCount).toBe(2);
  });

  it("renders only the readable hierarchy while reporting hidden cross-links", () => {
    const html = renderToStaticMarkup(createElement(KnowledgeMapGraph, { nodes, edges }));

    expect(html).toContain('aria-label="课程思维导图"');
    expect(html).toContain("拖动画布");
    expect(html).toContain("Ctrl/⌘ + 滚轮缩放");
    expect(html).toContain('aria-label="缩小思维导图"');
    expect(html).toContain('aria-label="放大思维导图"');
    expect(html).toContain('aria-label="适应画布"');
    expect(html.match(/data-cx-no-pending="true"/g)).toHaveLength(5);
    expect(html).toContain("2 条交叉关系已收起");
    expect(html).toContain("4 个下级节点已收起");
    expect(html).toContain("第一章 服务认知");
    expect(html).not.toContain("用户画像");
    expect(html).toContain('<svg class="absolute inset-0 h-full w-full" role="img" aria-label="课程思维导图" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"><g>');
    expect(html).not.toContain("transition-opacity");
  });

  it("keeps the toggled node at the same screen position after layout changes", () => {
    const currentOffset = { x: 24, y: -18 };
    const previous = { x: 400, y: 220, width: 256, height: 72 };
    const next = { x: 400, y: 460, width: 256, height: 72 };

    const anchored = anchorLayoutToNode(currentOffset, previous, next);

    expect(anchored.x + next.x + next.width / 2).toBe(currentOffset.x + previous.x + previous.width / 2);
    expect(anchored.y + next.y + next.height / 2).toBe(currentOffset.y + previous.y + previous.height / 2);
  });

  it("keeps every character of long labels and grows the node instead of truncating it", () => {
    const longLabel = "学习制定文化产品的开发、定价、分销及促销等完整策略并形成可执行方案";
    const longNodes = nodes.map((node) => node.id === "objective" ? { ...node, label: longLabel } : node);
    const html = renderToStaticMarkup(createElement(KnowledgeMapGraph, { nodes: longNodes, edges }));
    const shortLayout = buildKnowledgeMindMapLayout(nodes, edges);
    const longLayout = buildKnowledgeMindMapLayout(longNodes, edges);

    for (const line of wrapKnowledgeLabel(longLabel, 12)) expect(html).toContain(line);
    expect(html).not.toContain("…");
    expect(longLayout.positions.get("objective")!.height).toBeGreaterThan(shortLayout.positions.get("objective")!.height);
  });
});
