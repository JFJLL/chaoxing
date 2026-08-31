// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAssistantHub } from "../../src/components/course-workspace/ai-assistant/AiAssistantHub";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

function renderHub() {
  return render(
    <AiAssistantHub courseId="course-1" courseTitle="文化市场营销学" canManage>
      <div>实时问答</div>
    </AiAssistantHub>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI assistant hub model actions", () => {
  it("submits textbook questions and renders the grounded model answer", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({
      item: {
        id: "qa-live",
        question: "什么是文化产品定位？",
        answer: "定位需要结合受众、价值主张与竞争差异。[1]",
        citations: [{ source: "教材第三章", chapter: "课程资料" }],
        relatedTopics: ["市场定位"]
      }
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderHub();

    fireEvent.click(screen.getByRole("button", { name: /教材知识答疑/ }));
    fireEvent.change(screen.getByPlaceholderText(/向 AI 助教提问/), {
      target: { value: "什么是文化产品定位？" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提问" }));

    expect(await screen.findByText(/定位需要结合受众/)).toBeTruthy();
    expect(screen.getByText(/教材第三章/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/ai-assistant", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "knowledge_qa", question: "什么是文化产品定位？" })
    }));
  });

  it("submits proposal text and replaces the demo review with model scoring", async () => {
    const feedback = {
      proposalTitle: "国潮出海方案",
      submitter: "当前提交",
      overallScore: 76,
      rubrics: [
        { dimension: "理论契合", score: 20, maxScore: 25, theoryMapping: "第三章", comment: "映射清楚" },
        { dimension: "需求证据", score: 18, maxScore: 25, theoryMapping: "需求分析", comment: "证据不足" },
        { dimension: "执行路径", score: 19, maxScore: 25, theoryMapping: "实施模型", comment: "路径可行" },
        { dimension: "合规闭环", score: 19, maxScore: 25, theoryMapping: "第六章", comment: "授权待核" }
      ],
      strengths: ["文化内核明确"],
      suggestions: ["补充用户调研样本"]
    };
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ feedback }));
    vi.stubGlobal("fetch", fetchMock);
    renderHub();

    fireEvent.click(screen.getByRole("button", { name: /方案初稿诊断/ }));
    fireEvent.change(screen.getByPlaceholderText(/粘贴或修改方案文字片段/), {
      target: { value: "本方案面向海外青年用户设计国潮文化产品，并通过线下体验与线上传播完成转化。" }
    });
    fireEvent.click(screen.getByRole("button", { name: /对照教材理论进行结构化诊断/ }));

    expect(await screen.findByText("国潮出海方案")).toBeTruthy();
    expect(screen.getByText("76")).toBeTruthy();
    expect(screen.getByText(/补充用户调研样本/)).toBeTruthy();
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual(expect.objectContaining({
      mode: "proposal_review"
    }));
  });

  it("sends roleplay history and appends the real persona reply", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({
      reply: "请给出首期投入、毛利率和预计回本周期的具体测算依据。"
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderHub();

    fireEvent.click(screen.getByRole("button", { name: /角色演练模拟/ }));
    fireEvent.change(screen.getByPlaceholderText(/输入您对 周总监/), {
      target: { value: "我们通过门票与文创产品获得收入。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText(/请给出首期投入/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual(expect.objectContaining({
      mode: "roleplay",
      personaId: "persona-1"
    }));
    expect(body.messages.at(-1)).toEqual({ sender: "user", text: "我们通过门票与文创产品获得收入。" });
  });
});
