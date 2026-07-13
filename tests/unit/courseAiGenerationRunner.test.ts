import { describe, expect, it, vi } from "vitest";
import { AiServiceError } from "@/lib/ai/errors";
import { runAiGenerationJobWith } from "@/lib/courseWorkspace/runAiGenerationJob";

const validSnapshot = JSON.stringify({
  appType: "lesson_plan",
  context: {
    course: { kind: "course", id: "course-1", label: "课程：测试", title: "测试", description: null, truncated: false },
    scope: { kind: "course", id: "course-1", label: "全课程", truncated: false },
    outline: { kind: "outline", id: "course-outline", label: "课程结构", truncated: false, items: [] },
    imports: { kind: "import_collection", id: "course-imports", label: "课程导入原文", truncated: false, scopeExcluded: false, items: [] },
    knowledgeMap: null,
    knowledgeMapScopeExcluded: false,
    resources: { kind: "resource_collection", id: "course-resources", label: "课程资料", truncated: false, scopeExcluded: false, items: [] },
    userPrompt: null,
    truncated: false
  }
});

function dependencies(overrides: Partial<Parameters<typeof runAiGenerationJobWith>[1]> = {}) {
  return {
    claim: vi.fn().mockResolvedValue(true),
    readClaimed: vi.fn().mockResolvedValue({
      id: "artifact-1",
      appType: "lesson_plan",
      inputSnapshot: validSnapshot
    }),
    generate: vi.fn().mockResolvedValue({
      objectives: ["理解概念"],
      keyPoints: ["概念边界"],
      teachingProcess: [{ phase: "导入", minutes: 10, activity: "案例" }],
      assessment: ["问答"]
    }),
    normalize: vi.fn((_appType, payload) => payload),
    succeed: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe("AI generation job runner", () => {
  it("claims QUEUED exactly once before reading or generating", async () => {
    const deps = dependencies({ claim: vi.fn().mockResolvedValue(false) });

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.claim).toHaveBeenCalledOnce();
    expect(deps.claim).toHaveBeenCalledWith("artifact-1", "lease-1");
    expect(deps.readClaimed).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("generates from the persisted exact snapshot and materializes a draft", async () => {
    const deps = dependencies();

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.readClaimed).toHaveBeenCalledWith("artifact-1", "lease-1");
    expect(deps.generate).toHaveBeenCalledWith(expect.objectContaining({ appType: "lesson_plan" }));
    expect(deps.succeed).toHaveBeenCalledWith(
      "artifact-1",
      "lease-1",
      JSON.stringify({
        objectives: ["理解概念"],
        keyPoints: ["概念边界"],
        teachingProcess: [{ phase: "导入", minutes: 10, activity: "案例" }],
        assessment: ["问答"]
      })
    );
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("persists a redacted stable AI failure and never substitutes local content", async () => {
    const deps = dependencies({
      generate: vi.fn().mockRejectedValue(
        new AiServiceError("MODEL_REQUEST_FAILED", "Bearer private-token api_key=private-key")
      )
    });

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.succeed).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledOnce();
    expect(deps.fail).toHaveBeenCalledWith(
      "artifact-1",
      "lease-1",
      "MODEL_REQUEST_FAILED",
      expect.not.stringMatching(/private-token|private-key/)
    );
  });

  it("persists invalid snapshots as a stable invalid-output failure without calling the model", async () => {
    const deps = dependencies({
      readClaimed: vi.fn().mockResolvedValue({
        id: "artifact-1",
        appType: "lesson_plan",
        inputSnapshot: JSON.stringify({ appType: "courseware", context: {} })
      })
    });

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith(
      "artifact-1",
      "lease-1",
      "MODEL_INVALID_OUTPUT",
      "AI 生成任务输入无效，请重新发起生成"
    );
  });

  it("stops safely if the claimed record disappears", async () => {
    const deps = dependencies({ readClaimed: vi.fn().mockResolvedValue(null) });

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.succeed).not.toHaveBeenCalled();
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("cannot overwrite a newer lease when an old worker settles successfully or fails", async () => {
    const staleSuccess = dependencies({ succeed: vi.fn().mockResolvedValue(false) });
    await runAiGenerationJobWith("artifact-1", staleSuccess, "old-lease");
    expect(staleSuccess.succeed).toHaveBeenCalledWith("artifact-1", "old-lease", expect.any(String));

    const staleFailure = dependencies({
      generate: vi.fn().mockRejectedValue(new AiServiceError("MODEL_TIMEOUT", "timeout")),
      fail: vi.fn().mockResolvedValue(false)
    });
    await runAiGenerationJobWith("artifact-1", staleFailure, "old-lease");
    expect(staleFailure.fail).toHaveBeenCalledWith("artifact-1", "old-lease", "MODEL_TIMEOUT", "timeout");
  });

  it("normalizes model question ids before persisting the generated draft", async () => {
    const normalized = {
      questions: [{
        id: "question_11111111-1111-4111-8111-111111111111",
        type: "short_answer", stem: "题目", answer: "答案", explanation: "解析"
      }]
    };
    const deps = dependencies({
      readClaimed: vi.fn().mockResolvedValue({
        id: "artifact-1",
        appType: "question_generation",
        inputSnapshot: JSON.stringify({ appType: "question_generation", context: JSON.parse(validSnapshot).context })
      }),
      generate: vi.fn().mockResolvedValue({
        questions: [{ id: "model-forged-id", type: "short_answer", stem: "题目", answer: "答案", explanation: "解析" }]
      }),
      normalize: vi.fn().mockReturnValue(normalized)
    });

    await runAiGenerationJobWith("artifact-1", deps, "lease-1");

    expect(deps.normalize).toHaveBeenCalledWith("question_generation", expect.objectContaining({ questions: expect.any(Array) }));
    expect(deps.succeed).toHaveBeenCalledWith("artifact-1", "lease-1", JSON.stringify(normalized));
  });
});
