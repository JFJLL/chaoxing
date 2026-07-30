import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  findArtifact: vi.fn(),
  recommend: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseManager: mocks.requireCourseManager }));
vi.mock("@/lib/db", () => ({
  db: { courseAiArtifact: { findFirst: mocks.findArtifact } }
}));
vi.mock("@/lib/courseWorkspace/recommendSlideCount", () => ({
  recommendCoursewareSlideCount: mocks.recommend
}));

import { POST } from "../../src/app/api/courses/[courseId]/ai-apps/courseware/recommend-slide-count/route";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

const approvedLessonPlan = {
  objectives: ["理解概念"],
  keyPoints: ["重点"],
  teachingProcess: [{ phase: "导入", minutes: 10, activity: "引入" }],
  assessment: ["提问"]
};

function request(body: unknown) {
  return new Request("http://localhost/api/courses/course-1/ai-apps/courseware/recommend-slide-count", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
  mocks.recommend.mockResolvedValue({ recommendedSlideCount: 12, reason: "建议12页" });
  mocks.findArtifact.mockResolvedValue({
    id: "lesson-1",
    appType: "lesson_plan",
    status: "APPROVED",
    version: 1,
    payload: JSON.stringify(approvedLessonPlan),
    title: "文化市场营销教案"
  });
});

describe("POST recommend-slide-count", () => {
  it("recommends a page count for an approved lesson plan", async () => {
    const response = await POST(request({ sourceArtifactId: "lesson-1" }), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      recommendedSlideCount: 12,
      reason: "建议12页",
      sourceArtifactId: "lesson-1",
      sourceArtifactVersion: 1
    });
  });

  it("returns 404 when the artifact is not in this course", async () => {
    mocks.findArtifact.mockResolvedValue(null);
    const response = await POST(request({ sourceArtifactId: "other-course-artifact" }), context);
    expect(response.status).toBe(404);
    expect(mocks.recommend).not.toHaveBeenCalled();
  });

  it("rejects a courseware artifact as an invalid source", async () => {
    mocks.findArtifact.mockResolvedValue({ id: "courseware-1", appType: "courseware", status: "APPROVED", version: 1, payload: "{}", title: "课件" });
    const response = await POST(request({ sourceArtifactId: "courseware-1" }), context);
    expect(response.status).toBe(409);
    expect(mocks.recommend).not.toHaveBeenCalled();
  });

  it("returns 409 for an unapproved lesson plan", async () => {
    mocks.findArtifact.mockResolvedValue({ id: "lesson-1", appType: "lesson_plan", status: "DRAFT", version: 1, payload: JSON.stringify(approvedLessonPlan), title: "教案" });
    const response = await POST(request({ sourceArtifactId: "lesson-1" }), context);
    expect(response.status).toBe(409);
    expect(mocks.recommend).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-manager", async () => {
    mocks.requireCourseManager.mockRejectedValue(new Error("无权管理课程"));
    const response = await POST(request({ sourceArtifactId: "lesson-1" }), context);
    expect(response.status).toBe(403);
    expect(mocks.recommend).not.toHaveBeenCalled();
  });

  it("surfaces a model failure without leaking internals", async () => {
    mocks.recommend.mockRejectedValue(new Error("模型超时"));
    const response = await POST(request({ sourceArtifactId: "lesson-1" }), context);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.error).toBe("string");
  });
});
