import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CopilotAssistantReply,
  CopilotMarkdown
} from "@/components/course-workspace/CopilotMessage";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("CopilotMessage", () => {
  it("renders common Markdown structures in assistant replies", () => {
    const html = renderToStaticMarkup(
      <CopilotMarkdown content={"## 分析\n\n**结论**\n\n- 第一项\n- 第二项\n\n`code`"} />
    );

    expect(html).toContain("<h2");
    expect(html).toContain("<strong class=");
    expect(html).toContain(">结论</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<code");
    expect(html).not.toContain("## 分析");
  });

  it("shows an accessible thinking state before the first streamed token", () => {
    const html = renderToStaticMarkup(<CopilotAssistantReply content="" pending />);

    expect(html).toContain('role="status"');
    expect(html).toContain("正在思考");
    expect(html).toContain("animate-spin");
  });
});
