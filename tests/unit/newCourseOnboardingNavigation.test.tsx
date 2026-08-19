// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>
}));
vi.mock("@/components/ui/Dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div role="dialog">{children}</div> : null
}));
vi.mock("@/components/ui/Input", () => ({
  Input: (props: any) => <input {...props} />
}));

import { NewCourseDialog } from "@/components/courses/NewCourseDialog";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("新建课程后的新手引导导航", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ course: { id: "course-onboarding" } })
    });
  });

  afterEach(() => cleanup());

  it("创建成功后直接进入第三步锚点所在的 AI 工作台", async () => {
    const onCourseCreated = vi.fn();
    window.addEventListener("teacher-onboarding:course-created", onCourseCreated);
    render(<NewCourseDialog />);

    fireEvent.click(screen.getByRole("button", { name: "新建课程" }));
    fireEvent.change(screen.getByPlaceholderText("请输入课程名称"), { target: { value: "新建课程" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/space/courses/course-onboarding/ai-workbench"));
    expect(onCourseCreated).toHaveBeenCalledTimes(1);
    window.removeEventListener("teacher-onboarding:course-created", onCourseCreated);
  });
});
