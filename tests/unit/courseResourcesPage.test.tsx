import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseResourceCard } from "@/components/course-workspace/CourseResourceCard";

describe("course resource cards", () => {
  it("opens drive-backed course materials in the browser preview", () => {
    const markup = renderToStaticMarkup(
      <CourseResourceCard
        resource={{
          id: "resource-1",
          title: "课程讲义",
          type: "FILE",
          url: null,
          driveFile: { id: "file-1", name: "讲义.pdf" }
        }}
      />
    );

    expect(markup).toContain('href="/api/drive/file-1?preview=1"');
    expect(markup).toContain('target="_blank"');
    expect(markup).not.toContain("download=1");
  });
});
