import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() })
}));

import { ImportJobManager } from "../../src/components/ai-import/ImportJobManager";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("ImportJobManager AI handoff", () => {
  it("links to the AI workbench instead of offering map-to-HTML generation", () => {
    const markup = renderToStaticMarkup(<ImportJobManager
      courseId="course-1"
      jobId="job-1"
      status="READY_FOR_REVIEW"
      map={{
        id: "map-1",
        title: "知识导图",
        summary: null,
        status: "DRAFT",
        nodes: [],
        edges: []
      }}
      htmlArtifact={null}
    />);

    expect(markup).toContain('href="/space/courses/course-1/ai-workbench/apps/courseware"');
    expect(markup).toContain('href="/space/courses/course-1/ai-workbench/apps/html_courseware"');
    expect(markup).not.toContain("生成HTML课件");
    expect(markup).not.toContain("generate-html");
  });
});
