import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AiCourseSearchView,
  createSearchSubmissionLock,
  requestCourseKnowledgeSearch,
  type AiCourseSearchResult
} from "../../src/components/course-workspace/AiCourseSearch";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const result: AiCourseSearchResult = {
  id: "lesson:lesson-1",
  type: "lesson",
  label: "第一章 / 第一课",
  snippet: "光合作用会把光能转化为化学能。",
  href: "/space/courses/course-1/structure#lesson-1"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("course AI search request", () => {
  it("posts a bounded query and validates a successful response", async () => {
    const send = vi.fn().mockResolvedValue(jsonResponse({ query: "光合作用", results: [result] }));

    await expect(requestCourseKnowledgeSearch("course-1", "光合作用", send)).resolves.toEqual([result]);
    expect(send).toHaveBeenCalledWith("/api/courses/course-1/ai-search", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ query: "光合作用" })
    }));
  });

  it.each([
    new Response("bad gateway", { status: 502 }),
    jsonResponse({ results: [{ ...result, href: "https://evil.example" }] }),
    jsonResponse({ results: [{ ...result, href: "/space/courses/course-2/resources" }] }),
    jsonResponse({ results: [{ ...result, snippet: 123 }] })
  ])("rejects backend failures or malformed success payloads", async (response) => {
    const send = vi.fn().mockResolvedValue(response);

    await expect(requestCourseKnowledgeSearch("course-1", "光合作用", send)).rejects.toThrow();
  });

  it("preserves a safe backend failure message for retry", async () => {
    const send = vi.fn().mockResolvedValue(jsonResponse({
      code: "MODEL_NOT_CONFIGURED",
      error: "AI 服务未配置，请联系管理员",
      retryable: true
    }, 503));

    await expect(requestCourseKnowledgeSearch("course-1", "光合作用", send)).rejects.toMatchObject({
      message: "AI 服务未配置，请联系管理员"
    });
  });

  it.each([
    ["AI_SEARCH_RATE_LIMITED", "AI 搜索请求过于频繁，请稍后重试", 429],
    ["AI_SEARCH_BODY_TOO_LARGE", "AI 搜索请求内容过大", 413]
  ])("preserves the safe %s response", async (code, error, status) => {
    const send = vi.fn().mockResolvedValue(jsonResponse({ code, error, retryable: code === "AI_SEARCH_RATE_LIMITED" }, status));

    await expect(requestCourseKnowledgeSearch("course-1", "光合作用", send)).rejects.toMatchObject({ message: error });
  });

  it("locks duplicate synchronous submissions until released", () => {
    const lock = createSearchSubmissionLock();

    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });
});

describe("AiCourseSearchView", () => {
  const baseProps = {
    query: "光合作用",
    onQueryChange: () => undefined,
    onSubmit: () => undefined,
    onRetry: () => undefined
  };

  it("renders loading and disables duplicate submission", () => {
    const markup = renderToStaticMarkup(<AiCourseSearchView {...baseProps} state={{ status: "loading", results: [] }} />);

    expect(markup).toContain("正在检索当前课程");
    expect(markup).toContain("disabled");
    expect(markup).toContain("animate-spin");
  });

  it("renders verbatim results with source type and a course-local link", () => {
    const markup = renderToStaticMarkup(<AiCourseSearchView {...baseProps} state={{ status: "success", results: [result] }} />);

    expect(markup).toContain("光合作用会把光能转化为化学能。");
    expect(markup).toContain("课程课时");
    expect(markup).toContain('href="/space/courses/course-1/structure#lesson-1"');
  });

  it("renders an explicit no-results state", () => {
    const markup = renderToStaticMarkup(<AiCourseSearchView {...baseProps} state={{ status: "success", results: [] }} />);

    expect(markup).toContain("当前课程中没有找到相关内容");
  });

  it("renders an explicit failure and retry while preserving the query", () => {
    const markup = renderToStaticMarkup(<AiCourseSearchView {...baseProps} state={{ status: "error", results: [], error: "AI 调用失败，请重试" }} />);

    expect(markup).toContain("AI 调用失败，请重试");
    expect(markup).toContain("重试");
    expect(markup).toContain('value="光合作用"');
    expect(markup).not.toContain("模板");
  });
});
