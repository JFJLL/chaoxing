import { describe, expect, it, vi } from "vitest";
import {
  ArtifactWorkflowError,
  confirmArtifact,
  publishArtifact,
  type ArtifactWorkflowStore,
  type ArtifactWorkflowTransaction
} from "@/lib/courseWorkspace/artifactWorkflow";
import { parseArtifactEditBody } from "@/lib/courseWorkspace/artifactPayload";

const lessonPayload = {
  objectives: ["理解概念"],
  keyPoints: ["关键点"],
  teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }],
  assessment: ["课堂提问"]
};

const questionPayload = {
  questions: [
    { id: "question_11111111-1111-4111-8111-111111111111", type: "single_choice", stem: "题目一", options: ["A", "B"], answer: "A", explanation: "解析一" },
    { id: "question_22222222-2222-4222-8222-222222222222", type: "short_answer", stem: "题目二", answer: "答案二", explanation: "解析二" }
  ]
};

type Artifact = {
  id: string;
  courseId: string;
  seriesId: string;
  sourceArtifactId: string | null;
  appType: string;
  status: string;
  payload: string | null;
};

function workflowStore(options?: {
  artifact?: Artifact | null;
  approvedQuestionIds?: string[];
  sourceCourseware?: { id: string; courseId: string; appType: string; status: string; payload: string | null } | null;
  transitionCount?: number;
}) {
  const artifact: Artifact | null = options && "artifact" in options
    ? options.artifact ?? null
    : {
        id: "artifact-v2",
        courseId: "course-1",
        seriesId: "series-1",
        sourceArtifactId: null,
        appType: "question_generation",
        status: "DRAFT",
        payload: JSON.stringify(questionPayload)
      };
  const calls = {
    upsert: vi.fn(),
    archiveQuestions: vi.fn(),
    approve: vi.fn().mockResolvedValue(options?.transitionCount ?? 1),
    archivePublished: vi.fn(),
    publish: vi.fn().mockResolvedValue(options?.transitionCount ?? 1)
  };
  const transaction: ArtifactWorkflowTransaction<Record<string, unknown>> = {
    findArtifact: vi.fn().mockResolvedValue(artifact),
    findApprovedQuestionIds: vi.fn().mockResolvedValue(options?.approvedQuestionIds ?? []),
    findSourceCourseware: vi.fn().mockResolvedValue(options?.sourceCourseware ?? null),
    approveArtifact: calls.approve,
    upsertQuestion: calls.upsert,
    archiveQuestionsExcept: calls.archiveQuestions,
    archivePublishedInSeries: calls.archivePublished,
    publishArtifact: calls.publish,
    findSafeArtifact: vi.fn().mockResolvedValue({ id: artifact?.id ?? "missing", status: "APPROVED" })
  };
  const store: ArtifactWorkflowStore<Record<string, unknown>> = {
    transaction: (operation) => operation(transaction)
  };
  return { store, calls, transaction };
}

describe("artifact edit payload", () => {
  it("strictly validates title and app-specific payload and normalizes JSON", () => {
    expect(parseArtifactEditBody("lesson_plan", { title: "  新教案  ", payload: lessonPayload, lockVersion: 3 })).toEqual({
      title: "新教案",
      payload: JSON.stringify(lessonPayload),
      lockVersion: 3
    });
    expect(() => parseArtifactEditBody("lesson_plan", { title: "教案", payload: { slides: [] }, lockVersion: 3 })).toThrow();
    expect(() => parseArtifactEditBody("lesson_plan", { title: "教案", payload: lessonPayload, lockVersion: 3, seriesId: "forged" })).toThrow();
    expect(() => parseArtifactEditBody("lesson_plan", { title: "教案", payload: lessonPayload })).toThrow();
  });

  it("forbids manual HTML editing", () => {
    try {
      parseArtifactEditBody("html_courseware", { title: "HTML", payload: {} });
      throw new Error("expected parser to reject HTML editing");
    } catch (error) {
      expect(error).toMatchObject({ code: "ARTIFACT_HTML_EDIT_FORBIDDEN" });
    }
  });
});

describe("confirmArtifact", () => {
  it("materializes stable question keys, updates existing IDs, and archives removed questions atomically", async () => {
    const { store, calls } = workflowStore();
    await confirmArtifact(store, { courseId: "course-1", artifactId: "artifact-v2", userId: "teacher-1" });

    expect(calls.approve).toHaveBeenCalledWith("artifact-v2", "course-1", expect.any(Date));
    expect(calls.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sourceKey: "question_11111111-1111-4111-8111-111111111111",
      sourceSeriesId: "series-1",
      sourceArtifactId: "artifact-v2",
      status: "APPROVED"
    }));
    expect(calls.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ sourceKey: "question_22222222-2222-4222-8222-222222222222" }));
    expect(calls.archiveQuestions).toHaveBeenCalledWith("course-1", "series-1", [
      "question_11111111-1111-4111-8111-111111111111",
      "question_22222222-2222-4222-8222-222222222222"
    ]);
  });

  it("rejects duplicate derived source keys before writing", async () => {
    const duplicate = workflowStore({
      artifact: {
        id: "artifact-v2", courseId: "course-1", seriesId: "series-1", sourceArtifactId: null,
        appType: "question_generation", status: "DRAFT",
        payload: JSON.stringify({ questions: [
          { id: "question_11111111-1111-4111-8111-111111111111", type: "short_answer", stem: "一", answer: "一", explanation: "一" },
          { id: "question_11111111-1111-4111-8111-111111111111", type: "short_answer", stem: "二", answer: "二", explanation: "二" }
        ] })
      }
    });
    await expect(confirmArtifact(duplicate.store, { courseId: "course-1", artifactId: "artifact-v2", userId: "teacher-1" }))
      .rejects.toMatchObject({ code: "ARTIFACT_NOT_CONFIRMABLE" });
    expect(duplicate.calls.approve).not.toHaveBeenCalled();
  });

  it("rejects confirmation when any question lacks a valid server key", async () => {
    const missing = workflowStore({
      artifact: {
        id: "artifact-v2", courseId: "course-1", seriesId: "series-1", sourceArtifactId: null,
        appType: "question_generation", status: "DRAFT",
        payload: JSON.stringify({ questions: [
          { type: "short_answer", stem: "无 key", answer: "答案", explanation: "解析" }
        ] })
      }
    });
    await expect(confirmArtifact(missing.store, { courseId: "course-1", artifactId: "artifact-v2", userId: "teacher-1" }))
      .rejects.toMatchObject({ code: "ARTIFACT_NOT_CONFIRMABLE" });
    expect(missing.calls.approve).not.toHaveBeenCalled();
  });

  it("rejects missing, cross-course, unapproved, or duplicate paper questions", async () => {
    for (const ids of [["q-1", "missing"], ["q-1", "q-1"]]) {
      const current = workflowStore({
        artifact: {
          id: "paper-1", courseId: "course-1", seriesId: "paper-series", sourceArtifactId: null,
          appType: "paper_assembly", status: "DRAFT",
          payload: JSON.stringify({ title: "试卷", sections: [{ name: "一", score: 20, questionIds: ids }] })
        },
        approvedQuestionIds: ["q-1"]
      });
      await expect(confirmArtifact(current.store, { courseId: "course-1", artifactId: "paper-1", userId: "teacher-1" }))
        .rejects.toMatchObject({ code: ids[0] === ids[1] ? "INVALID_PAPER_QUESTIONS" : "QUESTION_BANK_INSUFFICIENT" });
      expect(current.calls.approve).not.toHaveBeenCalled();
    }
  });

  it("requires HTML lineage to an approved courseware artifact in the same course", async () => {
    const current = workflowStore({
      artifact: {
        id: "html-1", courseId: "course-1", seriesId: "html-series", sourceArtifactId: "courseware-other",
        appType: "html_courseware", status: "DRAFT",
        payload: JSON.stringify({ html: "<!doctype html><html><head></head><body>x</body></html>", slideCount: 1, generatedAt: "2026-07-13T00:00:00.000Z" })
      },
      sourceCourseware: null
    });
    await expect(confirmArtifact(current.store, { courseId: "course-1", artifactId: "html-1", userId: "teacher-1" }))
      .rejects.toMatchObject({ code: "INVALID_HTML_COURSEWARE_SOURCE" });
  });

  it("revalidates the source courseware payload when confirming HTML lineage", async () => {
    const artifact = {
      id: "html-1", courseId: "course-1", seriesId: "html-series", sourceArtifactId: "courseware-1",
      appType: "html_courseware", status: "DRAFT",
      payload: JSON.stringify({ html: "<!doctype html><html><head></head><body>x</body></html>", slideCount: 1, generatedAt: "2026-07-13T00:00:00.000Z" })
    };
    const invalid = workflowStore({
      artifact,
      sourceCourseware: { id: "courseware-1", courseId: "course-1", appType: "courseware", status: "APPROVED", payload: "not-json" }
    });
    await expect(confirmArtifact(invalid.store, { courseId: "course-1", artifactId: "html-1", userId: "teacher-1" }))
      .rejects.toMatchObject({ code: "INVALID_HTML_COURSEWARE_SOURCE" });
    expect(invalid.calls.approve).not.toHaveBeenCalled();

    const valid = workflowStore({
      artifact,
      sourceCourseware: {
        id: "courseware-1",
        courseId: "course-1",
        appType: "courseware",
        status: "PUBLISHED",
        payload: JSON.stringify({ slides: [{ title: "标题", bullets: ["要点"], speakerNotes: "备注" }] })
      }
    });
    await expect(confirmArtifact(valid.store, { courseId: "course-1", artifactId: "html-1", userId: "teacher-1" }))
      .resolves.toMatchObject({ status: "APPROVED" });
  });

  it("turns a lost DRAFT lease into a stable retryable conflict", async () => {
    const current = workflowStore({ transitionCount: 0 });
    await expect(confirmArtifact(current.store, { courseId: "course-1", artifactId: "artifact-v2", userId: "teacher-1" }))
      .rejects.toMatchObject({ code: "ARTIFACT_CONFIRM_CONFLICT", retryable: true });
  });
});

describe("publishArtifact", () => {
  it("archives only published siblings in the same series and conditionally publishes an allowed type", async () => {
    const current = workflowStore({
      artifact: {
        id: "paper-v2", courseId: "course-1", seriesId: "paper-series", sourceArtifactId: null,
        appType: "paper_assembly", status: "APPROVED", payload: "{}"
      }
    });
    await publishArtifact(current.store, { courseId: "course-1", artifactId: "paper-v2" });
    expect(current.calls.archivePublished).toHaveBeenCalledWith("course-1", "paper-series", "paper-v2");
    expect(current.calls.publish).toHaveBeenCalledWith("paper-v2", "course-1", expect.any(Date));
  });

  it("publishes lesson plans and rejects a lost publish race", async () => {
    const lesson = workflowStore({ artifact: {
      id: "lesson-1", courseId: "course-1", seriesId: "lesson-series", sourceArtifactId: null,
      appType: "lesson_plan", status: "APPROVED", payload: "{}"
    } });
    await expect(publishArtifact(lesson.store, { courseId: "course-1", artifactId: "lesson-1" }))
      .resolves.toBeDefined();

    const raced = workflowStore({ artifact: {
      id: "paper-1", courseId: "course-1", seriesId: "paper-series", sourceArtifactId: null,
      appType: "paper_assembly", status: "APPROVED", payload: "{}"
    }, transitionCount: 0 });
    await expect(publishArtifact(raced.store, { courseId: "course-1", artifactId: "paper-1" }))
      .rejects.toMatchObject({ code: "ARTIFACT_PUBLISH_CONFLICT", retryable: true });
  });

  it("retries the complete transaction for bounded SQLite/Prisma publication conflicts", async () => {
    const current = workflowStore({ artifact: {
      id: "paper-1", courseId: "course-1", seriesId: "paper-series", sourceArtifactId: null,
      appType: "paper_assembly", status: "APPROVED", payload: "{}"
    } });
    const transaction = current.store.transaction;
    current.store.transaction = vi.fn()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockImplementation(transaction);

    await publishArtifact(current.store, { courseId: "course-1", artifactId: "paper-1" }, 3, 0);
    expect(current.store.transaction).toHaveBeenCalledTimes(3);

    current.store.transaction = vi.fn().mockRejectedValue({ code: "P2002" });
    await expect(publishArtifact(current.store, { courseId: "course-1", artifactId: "paper-1" }, 2, 0))
      .rejects.toMatchObject({ code: "ARTIFACT_PUBLISH_CONFLICT", retryable: true });
  });
});

it("keeps workflow errors typed", () => {
  expect(new ArtifactWorkflowError("ARTIFACT_NOT_FOUND")).toBeInstanceOf(Error);
});
