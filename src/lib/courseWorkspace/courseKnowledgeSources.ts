import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { createTextCompletion } from "@/lib/ai/modelClient";
import {
  searchKnowledgeChunks,
  toFtsMatchQuery
} from "@/lib/document/knowledgeDb";

export type CourseKnowledgeSourceType =
  | "course"
  | "chapter"
  | "lesson"
  | "resource"
  | "announcement"
  | "import"
  | "question"
  | "drive"
  | "ai_artifact";

export type CourseKnowledgeSource = {
  id: string;
  type: CourseKnowledgeSourceType;
  label: string;
  snippet: string;
  href: string;
};

type AccessibleCourse = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  ownerId: string;
  collaborators?: Array<{ userId: string }>;
};

type PublicKnowledgeRows = {
  chapters: Array<{
    id: string;
    title: string;
    summary: string | null;
    lessons: Array<{ id: string; title: string; summary: string | null; keyPoints: string | null }>;
  }>;
  resources: Array<{ id: string; title: string; type: string }>;
  announcements: Array<{ id: string; title: string; body: string }>;
};

type ArtifactKnowledgeRow = {
  id: string;
  appType: string;
  title: string;
  payload: string | null;
  publishedPayload?: string | null;
  status: string;
};

type PrivateKnowledgeRows = {
  imports: Array<{ id: string; originalName: string; extractedText: string | null }>;
  questions: Array<{ id: string; stem: string; answer: string; explanation: string; status: string }>;
};

export type CourseKnowledgeSourceDependencies = {
  requireAccess(user: SessionUser, courseId: string): Promise<AccessibleCourse>;
  loadPublic(courseId: string, canManage: boolean): Promise<PublicKnowledgeRows>;
  loadArtifacts(courseId: string, canManage: boolean): Promise<ArtifactKnowledgeRow[]>;
  loadPrivate(courseId: string): Promise<PrivateKnowledgeRows>;
};

export class CourseKnowledgeAccessError extends Error {
  readonly code = "COURSE_KNOWLEDGE_ACCESS_DENIED";

  constructor() {
    super("COURSE_KNOWLEDGE_ACCESS_DENIED");
    this.name = "CourseKnowledgeAccessError";
  }
}

const MAX_SOURCES = 40;
const MAX_SNIPPET_LENGTH = 1_200;
const TYPE_LIMITS: Partial<Record<CourseKnowledgeSourceType, number>> = {
  course: 1,
  chapter: 6,
  lesson: 8,
  resource: 5,
  announcement: 4,
  ai_artifact: 6,
  import: 6,
  question: 4
};

const DRIVE_FTS_LIMIT = 30;
const DRIVE_SNIPPET_LABEL_PAGE_LIMIT = 240;

const defaultDependencies: CourseKnowledgeSourceDependencies = {
  requireAccess: requireCourseAccess,
  async loadPublic(courseId, canManage) {
    const [chapters, resources, announcements] = await Promise.all([
      db.chapter.findMany({
        where: { courseId },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          summary: true,
          lessons: {
            orderBy: [{ order: "asc" }, { id: "asc" }],
            take: 200,
            select: { id: true, title: true, summary: true, keyPoints: true }
          }
        }
      }),
      db.resource.findMany({
        where: { courseId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 100,
        select: { id: true, title: true, type: true }
      }),
      db.announcement.findMany({
        where: { courseId, ...(canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }) },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
        select: { id: true, title: true, body: true }
      })
    ]);
    return { chapters, resources, announcements };
  },
  loadArtifacts(courseId, canManage) {
    return db.courseAiArtifact.findMany({
      where: {
        courseId,
        ...(canManage ? {} : { status: "PUBLISHED", appType: "ppt_courseware" })
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 100,
      select: { id: true, appType: true, title: true, payload: true, publishedPayload: true, status: true }
    });
  },
  async loadPrivate(courseId) {
    const [imports, questions] = await Promise.all([
      db.documentImportJob.findMany({
        where: { courseId, extractedText: { not: null } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
        select: { id: true, originalName: true, extractedText: true }
      }),
      db.courseQuestion.findMany({
        where: { courseId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 100,
        select: { id: true, stem: true, answer: true, explanation: true, status: true }
      })
    ]);
    return { imports, questions };
  }
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "排队中",
    GENERATING: "生成中",
    DRAFT: "草稿",
    FAILED: "失败",
    APPROVED: "已确认",
    PUBLISHED: "已发布",
    ARCHIVED: "历史版本"
  };
  return labels[status] ?? status;
}

function appendChunks(
  sources: CourseKnowledgeSource[],
  input: Omit<CourseKnowledgeSource, "id" | "snippet"> & { baseId: string; text: string | null }
) {
  const text = input.text;
  if (!text || !text.trim()) return;
  let typeCount = sources.filter((source) => source.type === input.type).length;
  const typeLimit = TYPE_LIMITS[input.type] ?? MAX_SOURCES;
  for (
    let offset = 0, index = 1;
    offset < text.length && sources.length < MAX_SOURCES && typeCount < typeLimit;
    offset += MAX_SNIPPET_LENGTH, index += 1, typeCount += 1
  ) {
    sources.push({
      id: `${input.baseId}:${index}`,
      type: input.type,
      label: input.label,
      snippet: text.slice(offset, offset + MAX_SNIPPET_LENGTH),
      href: input.href
    });
  }
}

export type DriveKnowledgeFile = { id: string; name: string };

type TextCompletion = (input: { system: string; user: string; model?: string }) => Promise<string | null>;

function parseEnglishTerms(output: string) {
  return output
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((term) => term.length >= 2 && term.length <= 60)
    .slice(0, 6);
}

function queryLatinTerms(query: string) {
  return [...query.matchAll(/[a-zA-Z][a-zA-Z'-]{1,59}/g)]
    .map((match) => match[0].toLocaleLowerCase())
    .filter((term) => term.length >= 2);
}

function queryChineseBigrams(query: string) {
  const chinese = query.replace(/[^\u3400-\u9fff]/g, "");
  const terms: string[] = [];
  for (let index = 0; index < chinese.length - 1; index += 1) {
    const bigram = chinese.slice(index, index + 2);
    if (!terms.includes(bigram)) terms.push(bigram);
  }
  return terms.slice(0, 12);
}

/**
 * Translates a (typically Chinese) question into English textbook terms so an
 * English-only PDF can be found through FTS5. The call is intentionally tiny;
 * when the model is unavailable the query's own Latin words and CJK bigrams
 * are used instead.
 */
async function translateQueryToEnglishTerms(query: string, complete: TextCompletion) {
  try {
    const output = await complete({
      system: "你是教科书检索翻译器。只输出英文核心术语，用空格分隔，不要输出任何解释、编号或标点。",
      user: `提取以下中文问题的3个英文核心教科书术语，用空格分隔：${query}`
    });
    return parseEnglishTerms(output ?? "");
  } catch {
    return [];
  }
}

/**
 * Full-file retrieval for cloud-drive documents: the query is translated to
 * English keywords, matched against the local FTS5 chunk index (every chunk of
 * every file, not just the head), and the top hits become knowledge sources
 * whose snippet keeps the exact page for citations. Callers still run the
 * existing searchCourseKnowledge LLM re-ranking on the result.
 */
export async function searchDriveKnowledgeSources(input: {
  files: DriveKnowledgeFile[];
  query: string;
  complete?: TextCompletion;
  search?: typeof searchKnowledgeChunks;
  limit?: number;
}): Promise<CourseKnowledgeSource[]> {
  const fileIds = [...new Set(input.files.map((file) => file.id))];
  if (!fileIds.length || !input.query.trim()) return [];

  const complete = input.complete ?? createTextCompletion;
  const translated = await translateQueryToEnglishTerms(input.query, complete);
  const match = toFtsMatchQuery([
    ...translated,
    ...queryLatinTerms(input.query),
    ...queryChineseBigrams(input.query)
  ]);
  if (!match) return [];

  const hits = (input.search ?? searchKnowledgeChunks)({
    fileIds,
    match,
    substrings: queryChineseBigrams(input.query),
    limit: input.limit ?? DRIVE_FTS_LIMIT
  });
  const nameById = new Map(input.files.map((file) => [file.id, file.name]));
  return hits.map((hit, index) => {
    const name = nameById.get(hit.fileId) ?? "云盘资料";
    const pageLabel = hit.page > 0 ? `（第 ${hit.page} 页）` : "";
    const label = `${name}${pageLabel}`.slice(0, DRIVE_SNIPPET_LABEL_PAGE_LIMIT);
    return {
      id: `drive:${hit.fileId}:${hit.page}:${index + 1}`,
      type: "drive",
      label,
      snippet: hit.content,
      href: `/api/drive/${hit.fileId}?preview=1`
    };
  });
}

export async function buildCourseKnowledgeSources(input: {
  courseId: string;
  user: SessionUser;
  dependencies?: CourseKnowledgeSourceDependencies;
}): Promise<CourseKnowledgeSource[]> {
  const dependencies = input.dependencies ?? defaultDependencies;
  const course = await dependencies.requireAccess(input.user, input.courseId);
  const canManage = isCourseManagerRecord(input.user, course);
  if (!canManage && course.status !== "ACTIVE") throw new CourseKnowledgeAccessError();

  const [publicRows, artifacts] = await Promise.all([
    dependencies.loadPublic(input.courseId, canManage),
    dependencies.loadArtifacts(input.courseId, canManage)
  ]);
  const privateRows = canManage ? await dependencies.loadPrivate(input.courseId) : null;
  const root = `/space/courses/${input.courseId}`;
  const sources: CourseKnowledgeSource[] = [];

  appendChunks(sources, {
    baseId: `course:${course.id}`,
    type: "course",
    label: course.title,
    text: course.description ? `${course.title}\n${course.description}` : course.title,
    href: `${root}/structure`
  });
  for (const chapter of publicRows.chapters) {
    appendChunks(sources, {
      baseId: `chapter:${chapter.id}`,
      type: "chapter",
      label: chapter.title,
      text: chapter.summary ? `${chapter.title}\n${chapter.summary}` : chapter.title,
      href: `${root}/structure`
    });
    for (const lesson of chapter.lessons) {
      appendChunks(sources, {
        baseId: `lesson:${lesson.id}`,
        type: "lesson",
        label: lesson.title,
        text: [lesson.title, lesson.summary, lesson.keyPoints].filter(Boolean).join("\n"),
        href: `${root}/structure`
      });
    }
  }
  for (const resource of publicRows.resources) {
    appendChunks(sources, {
      baseId: `resource:${resource.id}`,
      type: "resource",
      label: resource.title,
      text: `${resource.title}\n类型：${resource.type}`,
      href: `${root}/resources`
    });
  }
  for (const announcement of publicRows.announcements) {
    appendChunks(sources, {
      baseId: `announcement:${announcement.id}`,
      type: "announcement",
      label: announcement.title,
      text: `${announcement.title}\n${announcement.body}`,
      href: `${root}/notices`
    });
  }
  for (const artifact of artifacts) {
    // Keep the student boundary here as well as in the Prisma query so custom
    // dependency implementations cannot leak legacy published artifact types.
    if (!canManage && (artifact.status !== "PUBLISHED" || artifact.appType !== "ppt_courseware")) continue;
    const artifactText = canManage ? artifact.payload : artifact.publishedPayload;
    appendChunks(sources, {
      baseId: `ai_artifact:${artifact.id}`,
      type: "ai_artifact",
      label: `${artifact.title}（${statusLabel(artifact.status)}）`,
      text: artifactText ?? null,
      href: `${root}/ai-workbench/apps/${artifact.appType}`
    });
  }
  for (const imported of privateRows?.imports ?? []) {
    appendChunks(sources, {
      baseId: `import:${imported.id}`,
      type: "import",
      label: imported.originalName,
      text: imported.extractedText,
      href: `${root}/ai-import/${imported.id}`
    });
  }
  for (const question of privateRows?.questions ?? []) {
    appendChunks(sources, {
      baseId: `question:${question.id}`,
      type: "question",
      label: `题目（${statusLabel(question.status)}）`,
      text: `题目：${question.stem}\n答案：${question.answer}\n解析：${question.explanation}`,
      href: `${root}/question-bank`
    });
  }

  return sources;
}
