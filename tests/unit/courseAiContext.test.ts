import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCourse: vi.fn(),
  findImports: vi.fn(),
  findKnowledgeMap: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: { findUnique: mocks.findCourse },
    documentImportJob: { findMany: mocks.findImports },
    courseKnowledgeMap: { findFirst: mocks.findKnowledgeMap }
  }
}));

import {
  MAX_AI_CONTEXT_JSON_CHARS,
  MAX_AI_CONTEXT_ID_CHARS,
  MAX_AI_SOURCE_TEXT_CHARS,
  AiContextTooLargeError,
  InvalidAiScopeError,
  boundCourseAiContext,
  buildCourseAiContext,
  composeCourseAiContext,
  courseAiContextSchema,
  type CourseAiContextData
} from "../../src/lib/courseWorkspace/buildAiContext";
import { buildCourseAiArtifactPrompt } from "../../src/lib/courseWorkspace/generateAiArtifact";

const contextData: CourseAiContextData = {
  course: { id: "course-1", title: "数字阅读", description: "课程简介" },
  chapters: [
    {
      id: "chapter-1",
      title: "第一章",
      summary: "基础",
      order: 1,
      lessons: [{ id: "lesson-1", title: "第一课", summary: "概念", order: 1, keyPoints: "重点一", activities: "讨论", assessments: "问答" }]
    },
    {
      id: "chapter-2",
      title: "第二章（范围外）",
      summary: null,
      order: 2,
      lessons: [{ id: "lesson-2", title: "第二课（范围外）", summary: null, order: 1, keyPoints: null, activities: null, assessments: null }]
    }
  ],
  imports: [
    { id: "import-1", originalName: "课程讲义.docx", extractedText: "讲义原文", status: "APPLIED", updatedAt: new Date("2026-07-13T02:00:00Z") }
  ],
  knowledgeMap: {
    id: "map-1",
    title: "课程知识图谱",
    summary: "图谱简介",
    status: "DRAFT",
    version: 2,
    nodes: [{ id: "node-1", label: "读者需求", type: "concept", summary: "核心概念", order: 1 }],
    edges: [{ id: "edge-1", sourceId: "node-1", targetId: "node-1", type: "related", label: "关联" }]
  },
  resources: [
    { id: "resource-course", title: "课程说明", type: "link", url: "/course", lessonId: null },
    { id: "resource-1", title: "第一课资料", type: "pdf", url: "/first", lessonId: "lesson-1" },
    { id: "resource-2", title: "第二课资料", type: "pdf", url: "/second", lessonId: "lesson-2" }
  ]
};

describe("course AI context composition", () => {
  it("keeps the full course outline and all in-course resources for course scope", () => {
    const context = composeCourseAiContext(contextData, { kind: "course" }, "生成课堂案例");

    expect(context.outline.items.map((chapter) => chapter.id)).toEqual(["chapter-1", "chapter-2"]);
    expect(context.resources.items.map((resource) => resource.id)).toEqual(["resource-course", "resource-1", "resource-2"]);
    expect(context.userPrompt).toMatchObject({ kind: "user_prompt", id: "user-prompt", label: "教师补充要求", text: "生成课堂案例" });
  });

  it("limits outline and lesson resources to a validated chapter scope", () => {
    const context = composeCourseAiContext(contextData, { kind: "chapter", chapterId: "chapter-1" }, "只处理第一章");

    expect(context.outline.items.map((chapter) => chapter.id)).toEqual(["chapter-1"]);
    expect(context.resources.items.map((resource) => resource.id)).toEqual(["resource-1"]);
    expect(context.resources.scopeExcluded).toBe(true);
    expect(context.imports).toMatchObject({ items: [], scopeExcluded: true });
    expect(context.knowledgeMap).toBeNull();
    expect(context.knowledgeMapScopeExcluded).toBe(true);
    expect(JSON.stringify(context)).not.toContain("讲义原文");
    expect(JSON.stringify(context)).not.toContain("读者需求");
    expect(JSON.stringify(context)).not.toContain("课程说明");
    expect(JSON.stringify(context)).not.toContain("范围外");
  });

  it("rejects a missing or cross-course chapter instead of accepting an arbitrary ID", () => {
    expect(() => composeCourseAiContext(contextData, { kind: "chapter", chapterId: "other-course-chapter" })).toThrow(InvalidAiScopeError);
  });

  it("limits outline and resources to a validated multi-chapter scope", () => {
    const context = composeCourseAiContext(contextData, { kind: "chapters", chapterIds: ["chapter-1", "chapter-2"] }, "处理前两章");
    expect(context.scope.kind).toBe("chapters");
    expect(context.outline.items.map((chapter) => chapter.id)).toEqual(["chapter-1", "chapter-2"]);
    // Both chapters' lesson resources are kept, but the course-level resource is excluded.
    expect(context.resources.items.map((resource) => resource.id)).toEqual(["resource-1", "resource-2"]);
    expect(context.resources.scopeExcluded).toBe(true);
    expect(context.imports).toMatchObject({ items: [], scopeExcluded: true });
    expect(context.scope.label).toContain("第一章");
    expect(context.scope.label).toContain("第二章（范围外）");
  });

  it("rejects a multi-chapter scope containing an unknown chapter id", () => {
    expect(() => composeCourseAiContext(contextData, { kind: "chapters", chapterIds: ["chapter-1", "ghost"] })).toThrow(InvalidAiScopeError);
  });

  it("preserves traceable labels and IDs for imports, graph entries, and resources", () => {
    const context = composeCourseAiContext(contextData, { kind: "course" });

    expect(context.imports.items[0]).toMatchObject({ kind: "import", id: "import-1", label: "导入文档：课程讲义.docx" });
    expect(context.knowledgeMap?.nodes[0]).toMatchObject({ kind: "knowledge_node", id: "node-1", label: "读者需求" });
    expect(context.knowledgeMap?.edges[0]).toMatchObject({ kind: "knowledge_edge", id: "edge-1", label: "关联" });
    expect(context.resources.items[0]).toMatchObject({ kind: "resource", id: "resource-course", label: "课程资料：课程说明" });
  });

  it("defensively excludes imported text that is not ready for review or applied", () => {
    const context = composeCourseAiContext({
      ...contextData,
      imports: [
        ...contextData.imports,
        { id: "failed-import", originalName: "失败文档.docx", extractedText: "不应进入模型", status: "FAILED", updatedAt: new Date() }
      ]
    }, { kind: "course" });

    expect(context.imports.items.map((source) => source.id)).toEqual(["import-1"]);
    expect(JSON.stringify(context)).not.toContain("不应进入模型");
  });

  it("bounds every source deterministically and keeps the total JSON under the hard limit", () => {
    const oversized: CourseAiContextData = {
      ...contextData,
      imports: Array.from({ length: 20 }, (_, index) => ({
        id: `import-${index}`,
        originalName: `讲义-${index}.docx`,
        extractedText: `${index}:${"原文".repeat(20_000)}`,
        status: "READY_FOR_REVIEW",
        updatedAt: new Date(2026, 0, index + 1)
      })),
      resources: Array.from({ length: 300 }, (_, index) => ({ id: `resource-${index}`, title: "资源".repeat(500), type: "pdf", url: `/r/${index}`, lessonId: null }))
    };

    const first = boundCourseAiContext(composeCourseAiContext(oversized, { kind: "course" }));
    const second = boundCourseAiContext(composeCourseAiContext(oversized, { kind: "course" }));

    expect(first).toEqual(second);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(MAX_AI_CONTEXT_JSON_CHARS);
    expect(first.imports.items.every((source) => source.text.length <= MAX_AI_SOURCE_TEXT_CHARS)).toBe(true);
    expect(first.imports.items.some((source) => source.truncated)).toBe(true);
    expect(first.truncated).toBe(true);
  });

  it("places the bounded context in the actual model prompt without out-of-scope chapters", () => {
    const context = boundCourseAiContext(composeCourseAiContext(contextData, { kind: "chapter", chapterId: "chapter-1" }, "面向新教师"));
    const prompt = buildCourseAiArtifactPrompt({ appType: "lesson_plan", context });

    expect(prompt).toContain("重点一");
    expect(prompt).toContain("面向新教师");
    expect(prompt).not.toContain("课程讲义.docx");
    expect(prompt).not.toContain("读者需求");
    expect(prompt).not.toContain("课程说明");
    expect(prompt).not.toContain("范围外");
  });

  it("clips every identifier field and never returns JSON above the hard limit", () => {
    const hugeId = "id".repeat(60_000);
    const oversizedIds: CourseAiContextData = {
      course: { id: hugeId, title: "课程", description: null },
      chapters: [{
        id: hugeId,
        title: "章节",
        summary: null,
        order: 1,
        lessons: [{ id: hugeId, title: "课时", summary: null, order: 1, keyPoints: null, activities: null, assessments: null }]
      }],
      imports: [{ id: hugeId, originalName: "讲义", extractedText: "原文", status: "APPLIED", updatedAt: new Date() }],
      knowledgeMap: {
        id: hugeId,
        title: "图谱",
        summary: null,
        status: "DRAFT",
        version: 1,
        nodes: [{ id: hugeId, label: "节点", type: "concept", summary: null, order: 1 }],
        edges: [{ id: hugeId, sourceId: hugeId, targetId: hugeId, type: "related", label: null }]
      },
      resources: [{ id: hugeId, title: "资料", type: "pdf", url: null, lessonId: hugeId }]
    };

    const context = boundCourseAiContext(composeCourseAiContext(oversizedIds, { kind: "course" }));
    const serialized = JSON.stringify(context);

    expect(serialized.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_JSON_CHARS);
    expect(context.course.id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.scope.id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.outline.items[0].id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.outline.items[0].lessons[0].id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.imports.items[0].id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.knowledgeMap?.nodes[0].id.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.knowledgeMap?.edges[0].sourceId.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.resources.items[0].lessonId?.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_ID_CHARS);
    expect(context.truncated).toBe(true);
  });

  it("throws a stable error rather than returning oversized JSON when no safe reduction exists", () => {
    const composed = composeCourseAiContext(contextData, { kind: "course" });
    const hostile = Object.assign(composed, { unknownUnboundedValue: "x".repeat(MAX_AI_CONTEXT_JSON_CHARS * 2) });

    expect(() => boundCourseAiContext(hostile)).toThrow(AiContextTooLargeError);
  });

  it("exports a strict runtime schema that rejects missing, extra, and oversized context", () => {
    const valid = boundCourseAiContext(composeCourseAiContext(contextData, { kind: "course" }));

    expect(courseAiContextSchema.parse(valid)).toEqual(valid);
    expect(courseAiContextSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    const { resources: _resources, ...missing } = valid;
    expect(courseAiContextSchema.safeParse(missing).success).toBe(false);
    expect(courseAiContextSchema.safeParse({
      ...valid,
      course: { ...valid.course, title: "x".repeat(MAX_AI_CONTEXT_JSON_CHARS) }
    }).success).toBe(false);
  });
});

describe("course AI context database boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCourse.mockResolvedValue({ ...contextData.course, chapters: contextData.chapters, resources: contextData.resources });
    mocks.findImports.mockResolvedValue(contextData.imports);
    mocks.findKnowledgeMap.mockResolvedValue(contextData.knowledgeMap);
  });

  it("queries only the requested course and only completed imported sources plus the latest teacher-visible map", async () => {
    const context = await buildCourseAiContext({ courseId: "course-1", scope: { kind: "course" }, prompt: "要求" });

    expect(context.course.id).toBe("course-1");
    expect(mocks.findCourse).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "course-1" } }));
    expect(mocks.findImports).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "course-1", deletedAt: null, status: { in: ["READY_FOR_REVIEW", "APPLIED"] }, extractedText: { not: null } }
    }));
    expect(mocks.findKnowledgeMap).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "course-1", status: { in: ["DRAFT", "PUBLISHED"] }, sourceJobId: { not: null } }
    }));
  });

  it("rejects a chapter that the course-scoped query did not return", async () => {
    await expect(buildCourseAiContext({ courseId: "course-1", scope: { kind: "chapter", chapterId: "foreign" } })).rejects.toBeInstanceOf(InvalidAiScopeError);
  });
});
