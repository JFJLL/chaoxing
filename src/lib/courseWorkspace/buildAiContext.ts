import { z } from "zod";
import { db } from "@/lib/db";
import { parseStoredDocumentSections } from "@/lib/imports/documentSections";

export const MAX_AI_CONTEXT_JSON_CHARS = 30_000;
export const MAX_AI_CONTEXT_ID_CHARS = 200;
export const MAX_AI_SOURCE_TEXT_CHARS = 6_000;

const MAX_FIELD_CHARS = 600;
const MAX_PROMPT_CHARS = 2_000;
const MAX_IMPORTS = 20;
const MAX_CHAPTERS = 20;
const MAX_LESSONS_PER_CHAPTER = 20;
const MAX_RESOURCES = 80;
const MAX_NODES = 80;
const MAX_EDGES = 120;

export const aiContextScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course") }).strict(),
  z.object({ kind: z.literal("chapter"), chapterId: z.string().trim().min(1).max(200) }).strict(),
  // Multiple selected chapters (多选/全选 short of the whole course).
  z.object({
    kind: z.literal("chapters"),
    chapterIds: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_CHAPTERS)
  }).strict()
]);

export type AiContextScope = z.infer<typeof aiContextScopeSchema>;

export type AiDocumentSourceSelection = {
  documentId: string;
  sectionIds: string[];
};

export class InvalidAiScopeError extends Error {
  readonly code = "INVALID_AI_SCOPE";

  constructor(message = "所选课程范围无效") {
    super(message);
    this.name = "InvalidAiScopeError";
  }
}

export class AiContextTooLargeError extends Error {
  readonly code = "AI_CONTEXT_TOO_LARGE";

  constructor(message = "课程上下文过大，请缩小生成范围") {
    super(message);
    this.name = "AiContextTooLargeError";
  }
}

type LessonData = {
  id: string;
  title: string;
  summary: string | null;
  order: number;
  keyPoints: string | null;
  activities: string | null;
  assessments: string | null;
};

type ChapterData = {
  id: string;
  title: string;
  summary: string | null;
  order: number;
  lessons: LessonData[];
};

export type CourseAiContextData = {
  course: { id: string; title: string; description: string | null };
  chapters: ChapterData[];
  imports: Array<{
    id: string;
    originalName: string;
    extractedText: string;
    status: string;
    updatedAt: Date;
  }>;
  knowledgeMap: null | {
    id: string;
    title: string;
    summary: string | null;
    status: string;
    version: number;
    nodes: Array<{ id: string; label: string; type: string; summary: string | null; order: number }>;
    edges: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string | null }>;
  };
  resources: Array<{ id: string; title: string; type: string; url: string | null; lessonId: string | null }>;
};

type ContextItemBase = { kind: string; id: string; label: string; truncated: boolean };

export type CourseAiContext = {
  course: ContextItemBase & { kind: "course"; title: string; description: string | null };
  scope: { kind: "course" | "chapter" | "chapters"; id: string; label: string; truncated: boolean };
  outline: {
    kind: "outline";
    id: "course-outline";
    label: "课程结构";
    truncated: boolean;
    items: Array<ContextItemBase & {
      kind: "chapter";
      title: string;
      summary: string | null;
      lessons: Array<ContextItemBase & {
        kind: "lesson";
        title: string;
        summary: string | null;
        keyPoints: string | null;
        activities: string | null;
        assessments: string | null;
      }>;
    }>;
  };
  imports: {
    kind: "import_collection";
    id: "course-imports";
    label: string;
    truncated: boolean;
    scopeExcluded: boolean;
    items: Array<ContextItemBase & { kind: "import"; originalName: string; text: string; status: string }>;
  };
  knowledgeMap: null | (ContextItemBase & {
    kind: "knowledge_map";
    title: string;
    summary: string | null;
    status: string;
    version: number;
    nodesTruncated: boolean;
    edgesTruncated: boolean;
    nodes: Array<ContextItemBase & { kind: "knowledge_node"; type: string; summary: string | null }>;
    edges: Array<ContextItemBase & { kind: "knowledge_edge"; sourceId: string; targetId: string; type: string }>;
  });
  knowledgeMapScopeExcluded: boolean;
  resources: {
    kind: "resource_collection";
    id: "course-resources";
    label: string;
    truncated: boolean;
    scopeExcluded: boolean;
    items: Array<ContextItemBase & { kind: "resource"; title: string; type: string; url: string | null; lessonId: string | null }>;
  };
  userPrompt: null | (ContextItemBase & { kind: "user_prompt"; text: string });
  truncated: boolean;
};

const contextIdSchema = z.string().trim().min(1).max(MAX_AI_CONTEXT_ID_CHARS);
const contextTextSchema = z.string().max(MAX_FIELD_CHARS);
const contextLabelSchema = z.string().trim().min(1).max(MAX_FIELD_CHARS + 100);
const contextBaseShape = {
  id: contextIdSchema,
  label: contextLabelSchema,
  truncated: z.boolean()
};
const lessonContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("lesson"),
  title: contextTextSchema,
  summary: contextTextSchema.nullable(),
  keyPoints: contextTextSchema.nullable(),
  activities: contextTextSchema.nullable(),
  assessments: contextTextSchema.nullable()
}).strict();
const chapterContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("chapter"),
  title: contextTextSchema,
  summary: contextTextSchema.nullable(),
  lessons: z.array(lessonContextSchema).max(MAX_LESSONS_PER_CHAPTER)
}).strict();
const importContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("import"),
  originalName: contextTextSchema,
  text: z.string().max(MAX_AI_SOURCE_TEXT_CHARS),
  status: z.enum(["READY_FOR_REVIEW", "APPLIED"])
}).strict();
const knowledgeNodeContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("knowledge_node"),
  type: contextTextSchema,
  summary: contextTextSchema.nullable()
}).strict();
const knowledgeEdgeContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("knowledge_edge"),
  sourceId: contextIdSchema,
  targetId: contextIdSchema,
  type: contextTextSchema
}).strict();
const resourceContextSchema = z.object({
  ...contextBaseShape,
  kind: z.literal("resource"),
  title: contextTextSchema,
  type: contextTextSchema,
  url: contextTextSchema.nullable(),
  lessonId: contextIdSchema.nullable()
}).strict();

export const courseAiContextSchema = z.object({
  course: z.object({
    ...contextBaseShape,
    kind: z.literal("course"),
    title: contextTextSchema,
    description: contextTextSchema.nullable()
  }).strict(),
  scope: z.object({
    kind: z.enum(["course", "chapter", "chapters"]),
    id: contextIdSchema,
    label: contextLabelSchema,
    truncated: z.boolean()
  }).strict(),
  outline: z.object({
    kind: z.literal("outline"),
    id: z.literal("course-outline"),
    label: z.literal("课程结构"),
    truncated: z.boolean(),
    items: z.array(chapterContextSchema).max(MAX_CHAPTERS)
  }).strict(),
  imports: z.object({
    kind: z.literal("import_collection"),
    id: z.literal("course-imports"),
    label: contextLabelSchema,
    truncated: z.boolean(),
    scopeExcluded: z.boolean(),
    items: z.array(importContextSchema).max(MAX_IMPORTS)
  }).strict(),
  knowledgeMap: z.object({
    ...contextBaseShape,
    kind: z.literal("knowledge_map"),
    title: contextTextSchema,
    summary: contextTextSchema.nullable(),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    version: z.number().int().min(1),
    nodesTruncated: z.boolean(),
    edgesTruncated: z.boolean(),
    nodes: z.array(knowledgeNodeContextSchema).max(MAX_NODES),
    edges: z.array(knowledgeEdgeContextSchema).max(MAX_EDGES)
  }).strict().nullable(),
  knowledgeMapScopeExcluded: z.boolean(),
  resources: z.object({
    kind: z.literal("resource_collection"),
    id: z.literal("course-resources"),
    label: contextLabelSchema,
    truncated: z.boolean(),
    scopeExcluded: z.boolean(),
    items: z.array(resourceContextSchema).max(MAX_RESOURCES)
  }).strict(),
  userPrompt: z.object({
    ...contextBaseShape,
    kind: z.literal("user_prompt"),
    text: z.string().max(MAX_PROMPT_CHARS)
  }).strict().nullable(),
  truncated: z.boolean()
}).strict().superRefine((context, refinement) => {
  if (JSON.stringify(context).length > MAX_AI_CONTEXT_JSON_CHARS) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      message: "课程上下文超过安全大小限制"
    });
  }
});

function clip(value: string | null | undefined, limit = MAX_FIELD_CHARS) {
  if (value == null) return { value: null, truncated: false };
  if (value.length <= limit) return { value, truncated: false };
  return { value: value.slice(0, limit), truncated: true };
}

function clipId(value: string) {
  if (value.length <= MAX_AI_CONTEXT_ID_CHARS) return { value, truncated: false };
  return { value: value.slice(0, MAX_AI_CONTEXT_ID_CHARS), truncated: true };
}

export function composeCourseAiContext(
  data: CourseAiContextData,
  scope: AiContextScope,
  prompt?: string
): CourseAiContext {
  const selectedChapters = scope.kind === "chapter"
    ? data.chapters.filter((chapter) => chapter.id === scope.chapterId)
    : scope.kind === "chapters"
      ? data.chapters.filter((chapter) => scope.chapterIds.includes(chapter.id))
      : data.chapters;
  if (scope.kind === "chapter" && selectedChapters.length !== 1) throw new InvalidAiScopeError();
  if (scope.kind === "chapters" && selectedChapters.length !== new Set(scope.chapterIds).size) {
    throw new InvalidAiScopeError();
  }

  const chapters = selectedChapters
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const selectedLessonIds = new Set(chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id)));
  const resources = scope.kind === "course"
    ? data.resources
    : data.resources.filter((resource) => resource.lessonId !== null && selectedLessonIds.has(resource.lessonId));

  const chaptersLabel = () => {
    const titles = chapters.map((chapter) => chapter.title).join("、");
    const label = `章节：${titles}`;
    return label.length > MAX_FIELD_CHARS
      ? { label: `${label.slice(0, MAX_FIELD_CHARS)}…（共 ${chapters.length} 章）`, truncated: true }
      : { label, truncated: false };
  };

  return {
    course: {
      kind: "course",
      id: data.course.id,
      label: `课程：${data.course.title}`,
      title: data.course.title,
      description: data.course.description,
      truncated: false
    },
    scope: scope.kind === "course"
      ? { kind: "course", id: data.course.id, label: "全课程", truncated: false }
      : scope.kind === "chapter"
        ? { kind: "chapter", id: chapters[0]!.id, label: `章节：${chapters[0]!.title}`, truncated: false }
        : { kind: "chapters", id: "selected-chapters", ...chaptersLabel() },
    outline: {
      kind: "outline",
      id: "course-outline",
      label: "课程结构",
      truncated: false,
      items: chapters.map((chapter) => ({
        kind: "chapter",
        id: chapter.id,
        label: `章节：${chapter.title}`,
        title: chapter.title,
        summary: chapter.summary,
        truncated: false,
        lessons: chapter.lessons.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((lesson) => ({
          kind: "lesson",
          id: lesson.id,
          label: `课时：${lesson.title}`,
          title: lesson.title,
          summary: lesson.summary,
          keyPoints: lesson.keyPoints,
          activities: lesson.activities,
          assessments: lesson.assessments,
          truncated: false
        }))
      }))
    },
    imports: {
      kind: "import_collection",
      id: "course-imports",
      label: scope.kind !== "course" ? "课程导入原文（缺少章节归属，已排除）" : "课程导入原文",
      truncated: false,
      scopeExcluded: scope.kind !== "course",
      items: (scope.kind !== "course" ? [] : data.imports)
        .filter((source) => source.status === "READY_FOR_REVIEW" || source.status === "APPLIED")
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id)).map((source) => ({
        kind: "import",
        id: source.id,
        label: `导入文档：${source.originalName}`,
        originalName: source.originalName,
        text: source.extractedText,
        status: source.status,
        truncated: false
      }))
    },
    knowledgeMap: scope.kind === "course" && data.knowledgeMap ? {
      kind: "knowledge_map",
      id: data.knowledgeMap.id,
      label: `知识图谱：${data.knowledgeMap.title}`,
      title: data.knowledgeMap.title,
      summary: data.knowledgeMap.summary,
      status: data.knowledgeMap.status,
      version: data.knowledgeMap.version,
      truncated: false,
      nodesTruncated: false,
      edgesTruncated: false,
      nodes: data.knowledgeMap.nodes.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((node) => ({
        kind: "knowledge_node",
        id: node.id,
        label: node.label,
        type: node.type,
        summary: node.summary,
        truncated: false
      })),
      edges: data.knowledgeMap.edges.slice().sort((a, b) => a.id.localeCompare(b.id)).map((edge) => ({
        kind: "knowledge_edge",
        id: edge.id,
        label: edge.label ?? `${edge.sourceId} → ${edge.targetId}`,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        type: edge.type,
        truncated: false
      }))
    } : null,
    knowledgeMapScopeExcluded: scope.kind !== "course" && data.knowledgeMap !== null,
    resources: {
      kind: "resource_collection",
      id: "course-resources",
      label: scope.kind !== "course" ? "课程资料（仅保留所选课时归属）" : "课程资料",
      truncated: false,
      scopeExcluded: scope.kind !== "course" && resources.length !== data.resources.length,
      items: resources.slice().sort((a, b) => Number(a.lessonId !== null) - Number(b.lessonId !== null) || a.id.localeCompare(b.id)).map((resource) => ({
        kind: "resource",
        id: resource.id,
        label: `课程资料：${resource.title}`,
        title: resource.title,
        type: resource.type,
        url: resource.url,
        lessonId: resource.lessonId,
        truncated: false
      }))
    },
    userPrompt: prompt ? { kind: "user_prompt", id: "user-prompt", label: "教师补充要求", text: prompt, truncated: false } : null,
    truncated: false
  };
}

function clipItemFields(context: CourseAiContext) {
  const courseId = clipId(context.course.id);
  const courseTitle = clip(context.course.title);
  const courseDescription = clip(context.course.description);
  context.course.id = courseId.value;
  context.course.title = courseTitle.value ?? "";
  context.course.description = courseDescription.value;
  context.course.label = `课程：${context.course.title}`;
  context.course.truncated ||= courseId.truncated || courseTitle.truncated || courseDescription.truncated;

  const scopeId = context.scope.kind === "course" ? courseId : clipId(context.scope.id);
  context.scope.id = scopeId.value;
  context.scope.truncated ||= scopeId.truncated;

  for (const chapter of context.outline.items) {
    const id = clipId(chapter.id);
    const title = clip(chapter.title);
    const summary = clip(chapter.summary);
    chapter.id = id.value;
    chapter.title = title.value ?? "";
    chapter.summary = summary.value;
    chapter.label = `章节：${chapter.title}`;
    chapter.truncated ||= id.truncated || title.truncated || summary.truncated;
    for (const lesson of chapter.lessons) {
      const id = clipId(lesson.id);
      lesson.id = id.value;
      lesson.truncated ||= id.truncated;
      for (const field of ["title", "summary", "keyPoints", "activities", "assessments"] as const) {
        const clipped = clip(lesson[field]);
        lesson[field] = clipped.value as never;
        lesson.truncated ||= clipped.truncated;
      }
      lesson.label = `课时：${lesson.title}`;
    }
  }
  if (context.scope.kind === "chapter") {
    const selected = context.outline.items.find((chapter) => chapter.id === context.scope.id);
    context.scope.label = `章节：${selected?.title ?? "所选章节"}`;
  }

  for (const source of context.imports.items) {
    const id = clipId(source.id);
    const name = clip(source.originalName);
    const text = clip(source.text, MAX_AI_SOURCE_TEXT_CHARS);
    source.id = id.value;
    source.originalName = name.value ?? "";
    source.text = text.value ?? "";
    source.label = `导入文档：${source.originalName}`;
    source.truncated ||= id.truncated || name.truncated || text.truncated;
  }
  if (context.knowledgeMap) {
    const id = clipId(context.knowledgeMap.id);
    context.knowledgeMap.id = id.value;
    context.knowledgeMap.truncated ||= id.truncated;
    for (const field of ["title", "summary"] as const) {
      const clipped = clip(context.knowledgeMap[field]);
      context.knowledgeMap[field] = clipped.value as never;
      context.knowledgeMap.truncated ||= clipped.truncated;
    }
    context.knowledgeMap.label = `知识图谱：${context.knowledgeMap.title}`;
    for (const node of context.knowledgeMap.nodes) {
      const id = clipId(node.id);
      const label = clip(node.label);
      const summary = clip(node.summary);
      const type = clip(node.type);
      node.id = id.value;
      node.label = label.value ?? "";
      node.summary = summary.value;
      node.type = type.value ?? "";
      node.truncated ||= id.truncated || label.truncated || summary.truncated || type.truncated;
    }
    for (const edge of context.knowledgeMap.edges) {
      const id = clipId(edge.id);
      const sourceId = clipId(edge.sourceId);
      const targetId = clipId(edge.targetId);
      const label = clip(edge.label);
      const type = clip(edge.type);
      edge.id = id.value;
      edge.sourceId = sourceId.value;
      edge.targetId = targetId.value;
      edge.label = label.value ?? "";
      edge.type = type.value ?? "";
      edge.truncated ||= id.truncated || sourceId.truncated || targetId.truncated || label.truncated || type.truncated;
    }
  }
  for (const resource of context.resources.items) {
    const id = clipId(resource.id);
    const lessonId = resource.lessonId === null ? null : clipId(resource.lessonId);
    const title = clip(resource.title);
    const url = clip(resource.url);
    const type = clip(resource.type);
    resource.id = id.value;
    resource.lessonId = lessonId?.value ?? null;
    resource.title = title.value ?? "";
    resource.url = url.value;
    resource.type = type.value ?? "";
    resource.label = `课程资料：${resource.title}`;
    resource.truncated ||= id.truncated || Boolean(lessonId?.truncated) || title.truncated || url.truncated || type.truncated;
  }
  if (context.userPrompt) {
    const value = clip(context.userPrompt.text, MAX_PROMPT_CHARS);
    context.userPrompt.text = value.value ?? "";
    context.userPrompt.truncated ||= value.truncated;
  }
}

export function boundCourseAiContext(input: CourseAiContext): CourseAiContext {
  const context = JSON.parse(JSON.stringify(input)) as CourseAiContext;
  clipItemFields(context);

  function cap<T>(items: T[], limit: number, mark: () => void) {
    if (items.length > limit) {
      items.splice(limit);
      mark();
    }
  }
  cap(context.outline.items, MAX_CHAPTERS, () => { context.outline.truncated = true; });
  for (const chapter of context.outline.items) cap(chapter.lessons, MAX_LESSONS_PER_CHAPTER, () => { chapter.truncated = true; context.outline.truncated = true; });
  cap(context.imports.items, MAX_IMPORTS, () => { context.imports.truncated = true; });
  cap(context.resources.items, MAX_RESOURCES, () => { context.resources.truncated = true; });
  if (context.knowledgeMap) {
    cap(context.knowledgeMap.nodes, MAX_NODES, () => { context.knowledgeMap!.nodesTruncated = true; });
    cap(context.knowledgeMap.edges, MAX_EDGES, () => { context.knowledgeMap!.edgesTruncated = true; });
  }

  let aggregateTruncated = context.truncated;
  const tooLarge = () => JSON.stringify(context).length > MAX_AI_CONTEXT_JSON_CHARS;
  while (tooLarge()) {
    const source = context.imports.items.slice().reverse().find((item) => item.text.length > 1_000);
    if (source) {
      source.text = source.text.slice(0, Math.max(1_000, source.text.length - 1_000));
      source.truncated = true;
      continue;
    }
    if (context.knowledgeMap?.edges.length) {
      context.knowledgeMap.edges.pop();
      context.knowledgeMap.edgesTruncated = true;
      continue;
    }
    if (context.resources.items.length) {
      context.resources.items.pop();
      context.resources.truncated = true;
      continue;
    }
    if (context.knowledgeMap?.nodes.length) {
      context.knowledgeMap.nodes.pop();
      context.knowledgeMap.nodesTruncated = true;
      continue;
    }
    const chapterWithLessons = context.outline.items.slice().reverse().find((chapter) => chapter.lessons.length > 0);
    if (chapterWithLessons) {
      chapterWithLessons.lessons.pop();
      chapterWithLessons.truncated = true;
      context.outline.truncated = true;
      continue;
    }
    if (context.scope.kind === "course" && context.outline.items.length > 0) {
      context.outline.items.pop();
      context.outline.truncated = true;
      continue;
    }
    if (context.imports.items.length > 0) {
      context.imports.items.pop();
      context.imports.truncated = true;
      continue;
    }
    if (context.userPrompt && context.userPrompt.text.length > 300) {
      context.userPrompt.text = context.userPrompt.text.slice(0, 300);
      context.userPrompt.truncated = true;
      continue;
    }
    if (context.knowledgeMap) {
      context.knowledgeMap = null;
      aggregateTruncated = true;
      continue;
    }
    if (context.course.description !== null) {
      context.course.description = null;
      context.course.truncated = true;
      continue;
    }
    throw new AiContextTooLargeError();
  }

  context.truncated = aggregateTruncated
    || context.course.truncated
    || context.scope.truncated
    || context.outline.truncated
    || context.imports.truncated
    || context.resources.truncated
    || Boolean(context.userPrompt?.truncated)
    || Boolean(context.knowledgeMap?.truncated || context.knowledgeMap?.nodesTruncated || context.knowledgeMap?.edgesTruncated)
    || context.imports.items.some((item) => item.truncated);
  return courseAiContextSchema.parse(context);
}

export async function buildCourseAiContext(input: {
  courseId: string;
  scope: AiContextScope;
  prompt?: string;
  sourceSelections?: AiDocumentSourceSelection[];
}): Promise<CourseAiContext> {
  const [course, imports, knowledgeMap] = await Promise.all([
    db.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        title: true,
        description: true,
        chapters: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            summary: true,
            order: true,
            lessons: {
              orderBy: { order: "asc" },
              select: { id: true, title: true, summary: true, order: true, keyPoints: true, activities: true, assessments: true }
            }
          }
        },
        resources: {
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, type: true, url: true, lessonId: true }
        }
      }
    }),
    db.documentImportJob.findMany({
      where: {
        courseId: input.courseId,
        deletedAt: null,
        status: { in: ["READY_FOR_REVIEW", "APPLIED"] },
        extractedText: { not: null },
        ...(input.sourceSelections?.length ? { id: { in: input.sourceSelections.map((selection) => selection.documentId) } } : {})
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: MAX_IMPORTS,
      select: { id: true, originalName: true, extractedText: true, parsedSections: true, status: true, updatedAt: true }
    }),
    db.courseKnowledgeMap.findFirst({
      where: { courseId: input.courseId, status: { in: ["DRAFT", "PUBLISHED"] }, sourceJobId: { not: null } },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        version: true,
        nodes: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, label: true, type: true, summary: true, order: true } },
        edges: { orderBy: { id: "asc" }, select: { id: true, sourceId: true, targetId: true, type: true, label: true } }
      }
    })
  ]);

  if (!course) throw new Error("课程不存在");
  const seenImportNames = new Set<string>();
  const uniqueImports: typeof imports = [];
  for (const item of imports) {
    const key = item.originalName.trim().toLowerCase();
    if (!seenImportNames.has(key)) {
      seenImportNames.add(key);
      uniqueImports.push(item);
    }
  }
  const data: CourseAiContextData = {
    course: { id: course.id, title: course.title, description: course.description },
    chapters: course.chapters,
    imports: uniqueImports.map((source) => {
      const selection = input.sourceSelections?.find((item) => item.documentId === source.id);
      let extractedText = source.extractedText!;
      if (selection?.sectionIds.length) {
        const sections = parseStoredDocumentSections(source.parsedSections);
        const sectionById = new Map(sections.map((section) => [section.id, section]));
        const selected = selection.sectionIds.map((sectionId) => sectionById.get(sectionId));
        if (selected.some((section) => !section)) {
          throw new InvalidAiScopeError("所选资料章节已失效，请重新选择");
        }
        extractedText = selected.map((section) => section!.text).join("\n\n");
      }
      return {
        id: source.id,
        originalName: source.originalName,
        extractedText,
        status: source.status,
        updatedAt: source.updatedAt
      };
    }),
    knowledgeMap,
    resources: course.resources
  };
  return boundCourseAiContext(composeCourseAiContext(data, input.scope, input.prompt));
}
