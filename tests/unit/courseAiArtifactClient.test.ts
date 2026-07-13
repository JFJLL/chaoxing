import { describe, expect, it, vi } from "vitest";
import {
  AiArtifactRequestError,
  confirmCourseAiArtifact,
  createCourseAiArtifact,
  getCourseAiArtifact,
  parseManagerAiArtifactDto,
  pollCourseAiArtifactUntilTerminal,
  publishCourseAiArtifact,
  retryCourseAiArtifact,
  saveCourseAiArtifactRevision
} from "../../src/lib/courseWorkspace/aiArtifactClient";

const artifact = {
  id: "artifact-1",
  seriesId: "series-1",
  appType: "question_generation",
  title: "AI 出题",
  prompt: "生成五道题",
  payload: null,
  scope: JSON.stringify({ kind: "chapter", chapterId: "chapter-1" }),
  status: "QUEUED",
  version: 1,
  errorCode: null,
  errorMessage: null,
  sourceJobId: null,
  sourceArtifactId: null,
  jobsAhead: 2,
  startedAt: null,
  finishedAt: null,
  approvedAt: null,
  publishedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("manager AI artifact DTO", () => {
  it("strictly parses supported fields and drops server-only extras", () => {
    const parsed = parseManagerAiArtifactDto({
      ...artifact,
      inputSnapshot: "secret context",
      runToken: "secret token",
      userId: "user-1",
      unexpected: "ignored"
    });

    expect(parsed).toEqual(artifact);
    expect(parsed).not.toHaveProperty("inputSnapshot");
    expect(parsed).not.toHaveProperty("runToken");
    expect(parsed).not.toHaveProperty("userId");
  });

  it.each([
    [{ ...artifact, status: "UNKNOWN" }],
    [{ ...artifact, payload: {} }],
    [{ ...artifact, jobsAhead: -1 }],
    [{ ...artifact, startedAt: "not-a-date" }],
    [{ ...artifact, createdAt: "1" }],
    [{ ...artifact, version: 0 }]
  ])("rejects a malformed manager DTO", (value) => {
    expect(() => parseManagerAiArtifactDto(value)).toThrow("AI 返回结果无效，请重试");
  });
});

describe("course AI artifact requests", () => {
  it("accepts POST 202 and sends a chapter scope", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ artifact }, 202));

    await expect(createCourseAiArtifact({
      courseId: "course-1",
      appType: "question_generation",
      prompt: "生成五道题",
      title: "AI 出题",
      scope: { kind: "chapter", chapterId: "chapter-1" }
    }, request)).resolves.toEqual(artifact);

    expect(request).toHaveBeenCalledWith("/api/courses/course-1/ai-apps", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        appType: "question_generation",
        prompt: "生成五道题",
        title: "AI 出题",
        scope: { kind: "chapter", chapterId: "chapter-1" }
      })
    }));
  });

  it("sends only the selected source artifact ID for HTML lineage", async () => {
    const htmlArtifact = { ...artifact, appType: "html_courseware", sourceArtifactId: "courseware-1" };
    const request = vi.fn().mockResolvedValue(jsonResponse({ artifact: htmlArtifact }, 202));

    await createCourseAiArtifact({
      courseId: "course-1",
      appType: "html_courseware",
      prompt: "课堂展示",
      title: "HTML 课件",
      scope: { kind: "course" },
      sourceArtifactId: "courseware-1"
    }, request);

    const sent = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(sent).toEqual({
      appType: "html_courseware",
      prompt: "课堂展示",
      title: "HTML 课件",
      scope: { kind: "course" },
      sourceArtifactId: "courseware-1"
    });
    expect(sent).not.toHaveProperty("sourceCourseware");
    expect(sent).not.toHaveProperty("questionIds");
  });

  it("returns a stable error for non-JSON responses", async () => {
    const request = vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 }));

    await expect(createCourseAiArtifact({
      courseId: "course-1",
      appType: "question_generation",
      prompt: "",
      title: "AI 出题",
      scope: { kind: "course" }
    }, request)).rejects.toMatchObject({
      name: "AiArtifactRequestError",
      code: "AI_REQUEST_FAILED",
      message: "AI 调用失败，请重试",
      status: 502
    });
  });

  it("returns a stable retryable error for network failures", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network down"));

    const promise = getCourseAiArtifact("course-1", "artifact-1", request);
    await expect(promise).rejects.toBeInstanceOf(AiArtifactRequestError);
    await expect(promise).rejects.toMatchObject({
      code: "AI_NETWORK_ERROR",
      message: "网络连接失败，请重试",
      retryable: true,
      status: null
    });
  });

  it("uses the safe backend error without exposing parser details", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({
      code: "AI_PREREQUISITE_REQUIRED",
      error: "请先生成并审核题目后再组卷",
      retryable: false
    }, 409));

    await expect(createCourseAiArtifact({
      courseId: "course-1",
      appType: "paper_assembly",
      prompt: "",
      title: "组卷",
      scope: { kind: "course" }
    }, request)).rejects.toMatchObject({
      code: "AI_PREREQUISITE_REQUIRED",
      message: "请先生成并审核题目后再组卷",
      retryable: false,
      status: 409
    });
  });

  it("requests detail, retry, revision, confirmation and publication contracts", async () => {
    const request = vi.fn().mockImplementation(async () => jsonResponse({ artifact }));

    await getCourseAiArtifact("course-1", "artifact-1", request);
    await retryCourseAiArtifact("course-1", "artifact-1", request);
    await saveCourseAiArtifactRevision("course-1", "artifact-1", {
      title: "新版题目",
      payload: { questions: [] }
    }, request);
    await confirmCourseAiArtifact("course-1", "artifact-1", request);
    await publishCourseAiArtifact("course-1", "artifact-1", request);

    expect(request.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body])).toEqual([
      ["/api/courses/course-1/ai-artifacts/artifact-1", "GET", undefined],
      ["/api/courses/course-1/ai-artifacts/artifact-1/retry", "POST", undefined],
      ["/api/courses/course-1/ai-artifacts/artifact-1", "PUT", JSON.stringify({ title: "新版题目", payload: { questions: [] } })],
      ["/api/courses/course-1/ai-artifacts/artifact-1/confirm", "POST", undefined],
      ["/api/courses/course-1/ai-artifacts/artifact-1/publish", "POST", undefined]
    ]);
  });

  it("polls serially and stops after the first terminal artifact", async () => {
    const generating = { ...artifact, status: "GENERATING", jobsAhead: null };
    const draft = {
      ...artifact,
      status: "DRAFT",
      jobsAhead: null,
      payload: JSON.stringify({ questions: [{ id: "question-1" }] }),
      finishedAt: "2026-07-13T00:01:00.000Z"
    };
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ artifact: generating }))
      .mockResolvedValueOnce(jsonResponse({ artifact: draft }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn();

    await expect(pollCourseAiArtifactUntilTerminal({
      courseId: "course-1",
      artifactId: "artifact-1",
      request,
      wait,
      onUpdate
    })).resolves.toEqual(draft);

    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, generating);
    expect(onUpdate).toHaveBeenNthCalledWith(2, draft);
  });
});
