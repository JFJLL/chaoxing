import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiTutor, type TutorConversationDto } from "../../src/components/course-workspace/AiTutor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("AI tutor UI", () => {
  it("renders a real empty conversation surface without template actions", () => {
    const markup = renderToStaticMarkup(
      <AiTutor courseId="course-1" courseTitle="访谈方法" initialConversations={[]} />
    );

    expect(markup).toContain("AI 助教");
    expect(markup).toContain("仅依据《访谈方法》中你有权限查看的内容回答");
    expect(markup).toContain("询问当前课程内容");
    expect(markup).not.toContain("本地模板");
    expect(markup).not.toContain("示例回答");
  });

  it("renders persisted assistant citations as course-local links", () => {
    const conversations: TutorConversationDto[] = [{
      id: "conversation-1",
      title: "课程问答",
      status: "ACTIVE",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:01:00.000Z",
      messages: [{
        id: "message-1",
        role: "ASSISTANT",
        content: "开放式问题适合收集经验 [1]",
        createdAt: "2026-07-13T00:01:00.000Z",
        citations: [{
          id: "lesson:1:1",
          type: "lesson",
          label: "访谈方法",
          snippet: "开放式问题用于收集经验。",
          href: "/space/courses/course-1/structure"
        }]
      }]
    }];
    const markup = renderToStaticMarkup(
      <AiTutor courseId="course-1" courseTitle="访谈方法" initialConversations={conversations} />
    );

    expect(markup).toContain("开放式问题适合收集经验 [1]");
    expect(markup).toContain('href="/space/courses/course-1/structure"');
    expect(markup).toContain("[1] 访谈方法");
  });
});
