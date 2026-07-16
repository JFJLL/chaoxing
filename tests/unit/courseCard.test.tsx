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
  enrollments: []
};

describe("CourseCard", () => {
  it("keeps course lifecycle actions on the taught-course card", () => {
    const html = renderToStaticMarkup(<CourseCard course={course} mode="taught" />);

    expect(html).toContain("已发布");
    expect(html).toContain("撤回发布");
    expect(html).toContain("进入课程");
  });

  it("does not expose teacher lifecycle actions on a learned-course card", () => {
    const html = renderToStaticMarkup(<CourseCard course={course} mode="learned" />);

    expect(html).not.toContain("撤回发布");
    expect(html).not.toContain("删除课程");
  });
});
