import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CourseCard } from "@/components/courses/CourseCard";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const course = {
  id: "course-1",
  title: "测试课程",
  status: "ACTIVE",
  owner: { name: "李老师" },
  enrollments: [],
  progress: 78
};

describe("CourseCard", () => {
  it("keeps course lifecycle actions on the taught-course card", () => {
    const html = renderToStaticMarkup(<CourseCard course={course} mode="taught" />);

    expect(html).toContain("已发布");
    expect(html).toContain("撤回发布");
    expect(html).toContain("进入课程");
    expect(html).not.toContain("学习进度");
  });

  it("does not expose teacher lifecycle actions on a learned-course card", () => {
    const html = renderToStaticMarkup(<CourseCard course={course} mode="learned" />);

    expect(html).not.toContain("撤回发布");
    expect(html).not.toContain("删除课程");
    expect(html).not.toContain("已发布");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="78"');
  });

  it("clamps learner progress to the progressbar range", () => {
    const over = renderToStaticMarkup(<CourseCard mode="learned" course={{ ...course, progress: 140 }} />);
    const under = renderToStaticMarkup(<CourseCard mode="learned" course={{ ...course, progress: -12 }} />);

    expect(over).toContain('aria-valuenow="100"');
    expect(over).toContain('width:100%');
    expect(under).toContain('aria-valuenow="0"');
    expect(under).toContain('width:0%');
  });
});
