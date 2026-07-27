import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCourseKnowledgeSources,
  type CourseKnowledgeSourceDependencies
} from "@/lib/courseWorkspace/courseKnowledgeSources";

const teacher = { id: "teacher-1", name: "教师", role: "TEACHER" as const, institutionId: "institution-1" };
const student = { id: "student-1", name: "学生", role: "STUDENT" as const, institutionId: "institution-1" };

function dependencies(): CourseKnowledgeSourceDependencies {
  return {
    requireAccess: vi.fn().mockResolvedValue({
      id: "course-1",
      title: "人工智能导论",
      description: "课程原始简介",
      status: "ACTIVE",
      ownerId: "teacher-1"
    }),
    loadPublic: vi.fn().mockResolvedValue({
      chapters: [{
        id: "chapter-1",
        title: "第一章",
        summary: "章节原始摘要",
        lessons: [{ id: "lesson-1", title: "机器学习", summary: "课时原始摘要", keyPoints: "监督学习\n无监督学习" }]
      }],
      resources: [{ id: "resource-1", title: "课程讲义", type: "document" }],
      announcements: [{ id: "announcement-1", title: "开课通知", body: "周一正式开课" }]
    }),
    loadArtifacts: vi.fn().mockImplementation(async (_courseId: string, canManage: boolean) => canManage
      ? [
          { id: "artifact-draft", appType: "lesson_plan", title: "内部教案", payload: "{\"objectives\":[\"内部目标\"]}", status: "DRAFT" },
          { id: "artifact-published", appType: "courseware", title: "公开课件", payload: "{\"slides\":[{\"title\":\"公开内容\"}]}", status: "PUBLISHED" }
        ]
      : [{
          id: "artifact-published",
          appType: "courseware",
          title: "公开课件",
          payload: "{\"slides\":[{\"title\":\"尚未确认的修改\"}]}",
          publishedPayload: "{\"slides\":[{\"title\":\"公开内容\"}]}",
          status: "PUBLISHED"
        }]),
    loadPrivate: vi.fn().mockResolvedValue({
      imports: [{ id: "import-1", originalName: "内部资料.docx", extractedText: "仅教师可见的导入原文" }],
      questions: [{ id: "question-1", stem: "私有题干", answer: "私有答案", explanation: "私有解析", status: "APPROVED" }]
    })
  };
}

describe("permission-filtered course knowledge sources", () => {
  it("lets the course owner retrieve private imports, answers, and every AI artifact", async () => {
    const deps = dependencies();
    const sources = await buildCourseKnowledgeSources({ courseId: "course-1", user: teacher, dependencies: deps });

    expect(deps.loadArtifacts).toHaveBeenCalledWith("course-1", true);
    expect(deps.loadPrivate).toHaveBeenCalledWith("course-1");
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "import:import-1:1", type: "import", snippet: "仅教师可见的导入原文" }),
      expect.objectContaining({ id: "question:question-1:1", type: "question", snippet: expect.stringContaining("私有答案") }),
      expect.objectContaining({ id: "ai_artifact:artifact-draft:1", type: "ai_artifact", label: "内部教案（草稿）" }),
      expect.objectContaining({ id: "ai_artifact:artifact-published:1", type: "ai_artifact", label: "公开课件（已发布）" })
    ]));
  });

  it("never loads private rows for students and returns only active structure, public resources, announcements, and published artifacts", async () => {
    const deps = dependencies();
    const sources = await buildCourseKnowledgeSources({ courseId: "course-1", user: student, dependencies: deps });

    expect(deps.loadArtifacts).toHaveBeenCalledWith("course-1", false);
    expect(deps.loadPrivate).not.toHaveBeenCalled();
    expect(sources.map((source) => source.type)).toEqual(expect.arrayContaining([
      "course", "chapter", "lesson", "resource", "announcement", "ai_artifact"
    ]));
    expect(sources.some((source) => source.type === "import" || source.type === "question")).toBe(false);
    expect(sources.some((source) => source.id.includes("artifact-draft"))).toBe(false);
    expect(sources.find((source) => source.id === "ai_artifact:artifact-published:1")?.snippet).toContain("公开内容");
    expect(sources.find((source) => source.id === "ai_artifact:artifact-published:1")?.snippet).not.toContain("尚未确认的修改");
  });

  it("rejects inactive-course student content even if an unsafe caller bypasses the normal access guard", async () => {
    const deps = dependencies();
    vi.mocked(deps.requireAccess).mockResolvedValue({
      id: "course-1", title: "已关闭课程", description: null, status: "ARCHIVED", ownerId: "teacher-1"
    });

    await expect(buildCourseKnowledgeSources({ courseId: "course-1", user: student, dependencies: deps }))
      .rejects.toMatchObject({ code: "COURSE_KNOWLEDGE_ACCESS_DENIED" });
    expect(deps.loadPublic).not.toHaveBeenCalled();
  });

  it("bounds chunks with stable unique IDs and course-local links without rewriting source text", async () => {
    const deps = dependencies();
    const text = `\n${"甲".repeat(1_199)}乙${"丙".repeat(2_000)}\n`;
    vi.mocked(deps.loadPrivate).mockResolvedValue({
      imports: [{ id: "import-long", originalName: "长文档.docx", extractedText: text }],
      questions: []
    });

    const first = await buildCourseKnowledgeSources({ courseId: "course-1", user: teacher, dependencies: deps });
    const second = await buildCourseKnowledgeSources({ courseId: "course-1", user: teacher, dependencies: deps });
    const chunks = first.filter((source) => source.id.startsWith("import:import-long:"));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((source) => source.snippet.length <= 1_200)).toBe(true);
    expect(chunks.map((source) => source.snippet).join("")).toBe(text);
    expect(new Set(first.map((source) => source.id)).size).toBe(first.length);
    expect(second.map((source) => source.id)).toEqual(first.map((source) => source.id));
    expect(first.length).toBeLessThanOrEqual(120);
    expect(first.every((source) => source.href.startsWith("/space/courses/course-1/"))).toBe(true);
  });

  it("reserves bounded space for every permitted source category under a large outline", async () => {
    const deps = dependencies();
    vi.mocked(deps.loadPublic).mockResolvedValue({
      chapters: Array.from({ length: 100 }, (_, index) => ({
        id: `chapter-${index}`,
        title: `章节 ${index}`,
        summary: `摘要 ${index}`,
        lessons: Array.from({ length: 3 }, (_lesson, lessonIndex) => ({
          id: `lesson-${index}-${lessonIndex}`,
          title: `课时 ${index}-${lessonIndex}`,
          summary: "课时摘要",
          keyPoints: "知识点"
        }))
      })),
      resources: [{ id: "resource-1", title: "课程讲义", type: "document" }],
      announcements: [{ id: "announcement-1", title: "通知", body: "通知正文" }]
    });

    const sources = await buildCourseKnowledgeSources({ courseId: "course-1", user: teacher, dependencies: deps });
    const types = new Set(sources.map((source) => source.type));

    expect(types).toEqual(new Set([
      "course", "chapter", "lesson", "resource", "announcement", "ai_artifact", "import", "question"
    ]));
    expect(sources.length).toBeLessThanOrEqual(40);
  });
});

describe("interactive AI persistence schema", () => {
  const root = process.cwd();
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    join(root, "prisma/migrations/20260716000000_course_copilot/migration.sql"),
    "utf8"
  );

  it("defines course-owned Copilot skills, conversations, attachments, and anonymous usage events", () => {
    expect(schema).toContain("model CourseAiConversation");
    expect(schema).toContain("model CourseAiMessage");
    expect(schema).toContain("model CopilotSkill");
    expect(schema).toContain("model CopilotConversationFile");
    expect(schema).toContain("model CopilotUsageEvent");
    expect(schema).not.toContain("model AiCoachTask");
    expect(schema).toContain("@@index([courseId, userId, kind, updatedAt])");
    expect(schema).toContain("@@index([activeSkillId, updatedAt])");
    expect(schema).toContain("@@index([conversationId, createdAt])");
    expect(schema).toContain("@@index([courseId, status, updatedAt])");
  });

  it("removes AI coach data and its database triggers", () => {
    expect(migration).toContain("DELETE FROM \"CourseAiConversation\" WHERE \"kind\" = 'COACH'");
    expect(migration).toContain("DROP TRIGGER IF EXISTS \"CourseAiConversation_coach_course_insert\"");
    expect(migration).toContain("DROP TABLE IF EXISTS \"AiCoachTask\"");
  });
});
