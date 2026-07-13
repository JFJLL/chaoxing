import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiServiceError } from "../../src/lib/ai/errors";

const routeMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  loadSources: vi.fn(),
  search: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: routeMocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: routeMocks.requireCourseAccess }));
vi.mock("@/lib/courseWorkspace/courseKnowledgeSources", () => ({
  buildCourseKnowledgeSources: routeMocks.loadSources
}));
vi.mock("@/lib/courseWorkspace/searchCourseKnowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/searchCourseKnowledge")>();
  return { ...actual, searchCourseKnowledge: routeMocks.search };
});

import { POST } from "../../src/app/api/courses/[courseId]/ai-search/route";
import { resetAiSearchRequestGuard } from "../../src/lib/ai/searchRequestGuard";

const sources = [{
  id: "lesson:lesson-1",
  type: "lesson",
  label: "第一章 / 第一课",
  snippet: "光合作用会把光能转化为化学能。",
  href: "/space/courses/course-1/structure#lesson-1"
}];
const routeContext = { params: Promise.resolve({ courseId: "course-1" }) };

function request(body: unknown) {
  return new Request("http://localhost/api/courses/course-1/ai-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

describe("POST /api/courses/:courseId/ai-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiSearchRequestGuard();
    routeMocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    routeMocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    routeMocks.loadSources.mockResolvedValue(sources);
    routeMocks.search.mockResolvedValue(sources);
  });

  it("authorizes course access and loads sources for the authenticated user", async () => {
    const response = await POST(request({ query: "光合作用" }) as never, routeContext);

    expect(response.status).toBe(200);
    expect(routeMocks.requireCourseAccess).toHaveBeenCalledWith(expect.objectContaining({ id: "student-1" }), "course-1");
    expect(routeMocks.loadSources).toHaveBeenCalledWith({
      courseId: "course-1",
      user: expect.objectContaining({ id: "student-1", role: "STUDENT" })
    });
    expect(routeMocks.search).toHaveBeenCalledWith(expect.objectContaining({ sources }));
    await expect(response.json()).resolves.toEqual({ query: "光合作用", results: sources });
  });

  it("returns 403 without loading sources when course access is denied", async () => {
    routeMocks.requireCourseAccess.mockRejectedValue(new Error("无权访问课程"));

    const response = await POST(request({ query: "光合作用" }) as never, routeContext);

    expect(response.status).toBe(403);
    expect(routeMocks.loadSources).not.toHaveBeenCalled();
    expect(routeMocks.search).not.toHaveBeenCalled();
  });

  it.each([
    ["not-json", 400],
    [{}, 400],
    [{ query: "" }, 400],
    [{ query: "a".repeat(301) }, 400],
    [{ query: "ok", privateSourceIds: ["import:private"] }, 400]
  ])("rejects malformed or unbounded client input", async (body, expectedStatus) => {
    const response = await POST(request(body) as never, routeContext);

    expect(response.status).toBe(expectedStatus);
    expect(routeMocks.loadSources).not.toHaveBeenCalled();
    expect(routeMocks.search).not.toHaveBeenCalled();
  });

  it("returns a safe retryable model failure", async () => {
    routeMocks.search.mockRejectedValue(new AiServiceError("MODEL_REQUEST_FAILED", "AI 服务调用失败：***"));

    const response = await POST(request({ query: "光合作用" }) as never, routeContext);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "MODEL_REQUEST_FAILED",
      error: "AI 服务调用失败：***",
      retryable: true
    });
  });

  it("permits only one in-flight search for the same user and course, then releases in finally", async () => {
    let finishSearch!: (value: typeof sources) => void;
    routeMocks.search.mockImplementationOnce(() => new Promise((resolve) => { finishSearch = resolve; }));

    const first = POST(request({ query: "第一次" }) as never, routeContext);
    await vi.waitFor(() => expect(routeMocks.search).toHaveBeenCalledTimes(1));
    const concurrent = await POST(request({ query: "并发请求" }) as never, routeContext);

    expect(concurrent.status).toBe(429);
    await expect(concurrent.json()).resolves.toMatchObject({ code: "AI_SEARCH_RATE_LIMITED", retryable: true });
    finishSearch(sources);
    await expect(first).resolves.toMatchObject({ status: 200 });

    const afterRelease = await POST(request({ query: "释放后" }) as never, routeContext);
    expect(afterRelease.status).toBe(200);
  });

  it("enforces ten requests per sliding window for each user-course key", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await POST(request({ query: `检索 ${index}` }) as never, routeContext);
      expect(response.status).toBe(200);
    }

    const limited = await POST(request({ query: "第十一次" }) as never, routeContext);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ code: "AI_SEARCH_RATE_LIMITED", retryable: true });

    routeMocks.requireUser.mockResolvedValue({ id: "student-2", role: "STUDENT" });
    const otherUser = await POST(request({ query: "另一位用户" }) as never, routeContext);
    expect(otherUser.status).toBe(200);
  });

  it.each([undefined, "1"])("rejects a chunked body over 4KB even with Content-Length=%s", async (contentLength) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (contentLength) headers["Content-Length"] = contentLength;
    const oversized = new Request("http://localhost/api/courses/course-1/ai-search", {
      method: "POST",
      headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"query":"'));
          controller.enqueue(new TextEncoder().encode("a".repeat(4_200)));
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const response = await POST(oversized as never, routeContext);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "AI_SEARCH_BODY_TOO_LARGE",
      error: "AI 搜索请求内容过大",
      retryable: false
    });
    expect(routeMocks.requireCourseAccess).not.toHaveBeenCalled();
    expect(routeMocks.search).not.toHaveBeenCalled();
  });
});
