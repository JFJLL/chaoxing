// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTutor, type TutorConversationDto } from "../../src/components/course-workspace/AiTutor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} href={String(href)}>{children}</a>
  )
}));

function conversation(id: string, title: string): TutorConversationDto {
  return {
    id,
    title,
    status: "ACTIVE",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    messages: []
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI tutor input draft handling", () => {
  beforeEach(() => {
    // Keep every request pending so tests only exercise the client-side state.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  });

  it("clears the input immediately when a message is submitted", () => {
    render(<AiTutor courseId="course-1" courseTitle="访谈方法" initialConversations={[conversation("a", "对话A")]} />);
    const textarea = screen.getByLabelText("课程问题") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "光合作用在哪里发生？" } });
    expect(textarea.value).toBe("光合作用在哪里发生？");

    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(textarea.value).toBe("");
  });

  it("does not carry a draft into another conversation when switching", () => {
    render(
      <AiTutor courseId="course-1" courseTitle="访谈方法" initialConversations={[conversation("a", "对话A"), conversation("b", "对话B")]} />
    );
    const textarea = screen.getByLabelText("课程问题") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "未发送的草稿" } });
    fireEvent.click(screen.getByText("对话B"));

    expect(textarea.value).toBe("");
  });

  it("clears a draft when starting a new conversation", () => {
    render(<AiTutor courseId="course-1" courseTitle="访谈方法" initialConversations={[conversation("a", "对话A")]} />);
    const textarea = screen.getByLabelText("课程问题") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "未发送的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "新对话" }));

    expect(textarea.value).toBe("");
  });
});
