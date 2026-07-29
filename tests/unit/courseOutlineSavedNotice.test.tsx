import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseOutlineSavedNotice } from "@/components/course-workspace/CourseOutlineSavedNotice";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("CourseOutlineSavedNotice", () => {
  it("makes the saved read-only state explicit and continues to AI lesson plans", () => {
    const markup = renderToStaticMarkup(<CourseOutlineSavedNotice courseId="course-1" />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain("课程目录已保存");
    expect(markup).toContain("目录已进入只读状态");
    expect(markup).toContain("生成 AI 教案");
    expect(markup).toContain('/space/courses/course-1/ai-workbench/apps/lesson_plan');
    expect(markup).not.toContain("AI文档建课");
    expect(markup).not.toContain("前往PPT课件");
  });
});
