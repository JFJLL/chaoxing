import { describe, expect, it, vi } from "vitest";
import { AiServiceError } from "../../src/lib/ai/errors";
import {
  CourseSearchInputError,
  searchCourseKnowledge,
  type CourseSearchSource
} from "../../src/lib/courseWorkspace/searchCourseKnowledge";

const sources: CourseSearchSource[] = [
  {
    id: "lesson:lesson-1",
    type: "lesson",
    label: "第一章 / 第一课",
    snippet: "光合作用会把光能转化为化学能。",
    href: "/space/courses/course-1/structure#lesson-1"
  },
  {
    id: "resource:resource-1",
    type: "resource",
    label: "实验指导书",
    snippet: "实验前需要检查光源和二氧化碳供应。",
    href: "/space/courses/course-1/resources#resource-1"
  }
];

describe("searchCourseKnowledge", () => {
  it("maps ranked server source IDs to verbatim server-owned results", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      sourceIds: ["resource:resource-1", "lesson:lesson-1"]
    }));

    await expect(searchCourseKnowledge({ query: "光合作用实验", sources, complete })).resolves.toEqual([
      sources[1],
      sources[0]
    ]);
  });

  it("supports an explicit no-results response", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ sourceIds: [] }));

    await expect(searchCourseKnowledge({ query: "量子引力", sources, complete })).resolves.toEqual([]);
  });

  it("fails explicitly when no model is configured", async () => {
    const complete = vi.fn().mockResolvedValue(null);

    await expect(searchCourseKnowledge({ query: "光合作用", sources, complete })).rejects.toMatchObject({
      code: "MODEL_NOT_CONFIGURED",
      message: "AI 服务未配置，请联系管理员"
    });
  });

  it("sanitizes provider failures without producing local results", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("upstream api_key=secret-value failed"));

    const promise = searchCourseKnowledge({ query: "光合作用", sources, complete });
    await expect(promise).rejects.toBeInstanceOf(AiServiceError);
    await expect(promise).rejects.toMatchObject({ code: "MODEL_REQUEST_FAILED" });
    await expect(promise).rejects.not.toThrow("secret-value");
    expect(complete).toHaveBeenCalledOnce();
  });

  it("retries one invalid ranking response before failing the search", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce(JSON.stringify({ sourceIds: ["lesson:lesson-1"] }));

    await expect(searchCourseKnowledge({ query: "光合作用", sources, complete })).resolves.toEqual([
      sources[0]
    ]);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it.each([
    "not-json",
    JSON.stringify({ sourceIds: ["unknown:1"] }),
    JSON.stringify({ sourceIds: ["lesson:lesson-1", "lesson:lesson-1"] }),
    JSON.stringify({ sourceIds: ["lesson:lesson-1"], extra: true })
  ])("rejects invalid or untrusted model output: %s", async (output) => {
    const complete = vi.fn().mockResolvedValue(output);

    await expect(searchCourseKnowledge({ query: "光合作用", sources, complete })).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("rejects empty or oversized queries before calling the model", async () => {
    const complete = vi.fn();

    await expect(searchCourseKnowledge({ query: "   ", sources, complete })).rejects.toBeInstanceOf(CourseSearchInputError);
    await expect(searchCourseKnowledge({ query: "a".repeat(301), sources, complete })).rejects.toBeInstanceOf(CourseSearchInputError);
    expect(complete).not.toHaveBeenCalled();
  });

  it("bounds the source list sent to the model", async () => {
    const manySources = Array.from({ length: 81 }, (_, index): CourseSearchSource => ({
      id: `lesson:${index + 1}`,
      type: "lesson",
      label: `第 ${index + 1} 课`,
      snippet: `课程原文 ${index + 1}`,
      href: `/space/courses/course-1/structure#${index + 1}`
    }));
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ sourceIds: [] }));

    await searchCourseKnowledge({ query: "课程", sources: manySources, complete });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.not.stringContaining("lesson:81")
    }));
  });
});
