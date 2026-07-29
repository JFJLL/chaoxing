import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  requireCourseManager: vi.fn(),
  findArtifact: vi.fn(),
  createArtifact: vi.fn(),
  generateHtml: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseManager: mocks.requireCourseManager
}));
vi.mock("@/lib/db", () => ({
  db: {
    courseAiArtifact: { findFirst: mocks.findArtifact, create: mocks.createArtifact }
  }
}));
vi.mock("@/lib/courseWorkspace/generateAiArtifact", () => ({
  generateHtmlCoursewareWithAi: mocks.generateHtml
}));

import { GET, POST } from "../../src/app/api/courses/[courseId]/html-courseware/route";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
  mocks.findArtifact.mockResolvedValue(null);
});

describe("legacy HTML courseware route", () => {
  it("never generates HTML directly from a knowledge map", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapId: "map-1" })
    }), context);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      code: "HTML_COURSEWARE_RETIRED",
      error: "HTML 互动课件已停止生成，请使用 PPT 课件",
      href: "/space/courses/course-1/ai-workbench/apps/ppt_courseware"
    });
    expect(mocks.generateHtml).not.toHaveBeenCalled();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it("loads only published HTML and safely hides a malformed payload", async () => {
    mocks.findArtifact.mockResolvedValue({
      id: "html-1",
      appType: "html_courseware",
      status: "PUBLISHED",
      payload: "not-json"
    });

    let response = await GET(new Request("http://localhost"), context);
    expect(mocks.findArtifact).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "course-1", appType: "html_courseware", status: "PUBLISHED" }
    }));
    await expect(response.json()).resolves.toEqual({ artifact: null });

    const payload = {
      html: "<!doctype html><html><head></head><body>内容</body></html>",
      slideCount: 1,
      generatedAt: "2026-07-13T00:00:00.000Z"
    };
    mocks.findArtifact.mockResolvedValue({
      id: "html-2",
      appType: "html_courseware",
      title: "已发布课件",
      status: "PUBLISHED",
      version: 2,
      payload: JSON.stringify(payload),
      publishedAt: new Date("2026-07-13T01:00:00.000Z"),
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
      prompt: "private teacher prompt",
      inputSnapshot: "private source courseware",
      userId: "teacher-1",
      sourceArtifactId: "source-1"
    });
    response = await GET(new Request("http://localhost"), context);
    const body = await response.json();
    expect(Object.keys(body.artifact).sort()).toEqual([
      "appType",
      "createdAt",
      "id",
      "payload",
      "publishedAt",
      "status",
      "title",
      "version"
    ]);
    expect(body.artifact).toMatchObject({ id: "html-2", payload });
    expect(mocks.findArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      select: {
        id: true,
        appType: true,
        title: true,
        status: true,
        version: true,
        payload: true,
        publishedAt: true,
        createdAt: true
      }
    }));
  });
});
