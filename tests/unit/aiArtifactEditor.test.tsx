import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AiArtifactEditor,
  createArtifactEditorDraft,
  editorDraftToRevisionBody
} from "../../src/components/course-workspace/AiArtifactEditor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("AI artifact editor conversions", () => {
  it("preserves server question IDs and omits an ID for new questions", () => {
    const draft = createArtifactEditorDraft("question_generation", "题目 v1", {
      questions: [{
        id: "question_123e4567-e89b-12d3-a456-426614174000",
        type: "single_choice",
        stem: "已有题",
        options: ["A", "B"],
        answer: "A",
        explanation: "解析"
      }]
    });
    if (draft.appType !== "question_generation") throw new Error("wrong draft");
    draft.payload.questions.push({
      type: "short_answer",
      stem: "新题",
      answer: "答案",
      explanation: "解析"
    });

    expect(editorDraftToRevisionBody(draft)).toEqual({
      title: "题目 v1",
      payload: {
        questions: [
          expect.objectContaining({ id: "question_123e4567-e89b-12d3-a456-426614174000", stem: "已有题" }),
          {
            type: "short_answer",
            stem: "新题",
            answer: "答案",
            explanation: "解析"
          }
        ]
      }
    });
  });

  it.each([
    ["lesson_plan", {
      objectives: ["目标"],
      keyPoints: ["重点"],
      teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }],
      assessment: ["测验"]
    }],
    ["courseware", {
      slides: [{ title: "第一页", bullets: ["要点"], speakerNotes: "讲稿" }]
    }],
    ["paper_assembly", {
      title: "期中卷",
      sections: [{ name: "选择题", score: 20, questionIds: ["question-db-1"] }]
    }]
  ] as const)("round-trips a structured %s payload", (appType, payload) => {
    const draft = createArtifactEditorDraft(appType, "产物标题", payload);
    expect(editorDraftToRevisionBody(draft)).toEqual({ title: "产物标题", payload });
  });

  it("renders HTML in a script-only sandbox and has no editable fields", () => {
    const markup = renderToStaticMarkup(
      <AiArtifactEditor
        appType="html_courseware"
        title="HTML 课件"
        payload={{
          html: "<!doctype html><html><body>课件</body></html>",
          slideCount: 1,
          generatedAt: "2026-07-13T00:00:00.000Z"
        }}
        onSave={() => undefined}
        onDirtyChange={() => undefined}
        busy={false}
      />
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).not.toContain("保存为新版本");
    expect(markup).not.toContain("<textarea");
  });
});
