import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { shouldLoadDrivePickerDocuments } from "../../src/components/ai-import/CourseDocumentImportSources";
import {
  AiAppGenerator,
  isRecommendationForSource,
  shouldAutoApplyRecommendation
} from "../../src/components/course-workspace/AiAppGenerator";
import { ChapterTree } from "../../src/components/courses/ChapterTree";
import { OutlineReviewEditor } from "../../src/components/ai-import/OutlineReviewEditor";
import type { ManagerAiArtifactDto } from "../../src/lib/courseWorkspace/aiArtifactClient";
import type { CourseAiAppDefinition } from "../../src/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "../../src/types/courseWorkspace";
import type { CourseDirectoryNode } from "../../src/types/course";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const baseArtifact: ManagerAiArtifactDto = {
  id: "artifact-1",
  seriesId: "series-1",
  appType: "lesson_plan",
  title: "教案",
  prompt: null,
  payload: null,
  scope: JSON.stringify({ kind: "course" }),
  status: "QUEUED",
  version: 1,
  errorCode: null,
  errorMessage: null,
  sourceJobId: null,
  sourceArtifactId: null,
  jobsAhead: null,
  startedAt: null,
  finishedAt: null,
  approvedAt: null,
  publishedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

function app(appType: CourseAiAppType): CourseAiAppDefinition & { appType: CourseAiAppType } {
  return { key: `ai-${appType}`, appType, title: appType, description: "", category: "备课中心", color: "blue", enabled: true };
}

describe("course drive picker lazy loading", () => {
  it.each([
    [false, false, false, false],
    [true, false, false, false],
    [true, true, false, true],
    [true, true, true, false]
  ] as const)("hasRoot=%s expanded=%s loaded=%s → request=%s", (hasRoot, expanded, loaded, expected) => {
    expect(shouldLoadDrivePickerDocuments(hasRoot, expanded, loaded)).toBe(expected);
  });
});

describe("course directory maintenance surface", () => {
  const chapters: CourseDirectoryNode[] = [
    { id: "chapter-1", title: "第一章", summary: "简介", order: 1, lessons: [
      { id: "lesson-1", title: "第一课时", summary: "", order: 1, estimatedMinutes: 45, keyPoints: [], suggestedActivities: [], assessmentPrompts: [] }
    ] }
  ];

  it("shows a read-only directory with an Edit affordance and no first-import wording", () => {
    const markup = renderToStaticMarkup(<ChapterTree courseId="course-1" initialChapters={chapters} initialOutlineVersion={1} />);
    expect(markup).toContain("课程目录");
    expect(markup).toContain(">编辑<");
    expect(markup).not.toContain("保存修改");
    expect(markup).not.toContain("AI文档建课");
    expect(markup).not.toContain("保存目录");
  });

  it("keeps the import review save labelled as saving the course directory", () => {
    const markup = renderToStaticMarkup(
      <OutlineReviewEditor
        jobId="job-1"
        courseId="course-1"
        initialOutline={{
          title: "综合目录",
          description: "综合目录说明",
          targetAudience: "学习者",
          learningObjectives: ["a", "b", "c"],
          chapters: [{ id: "chapter-1", title: "第一章", summary: "简介", order: 1, lessons: [
            { id: "lesson-1", title: "第一课时", summary: "", order: 1, estimatedMinutes: 45, keyPoints: [], suggestedActivities: [], assessmentPrompts: [] }
          ] }]
        }}
        initialOutlineVersion={0}
        initialBatchVersion={1}
        hasExistingDirectory={false}
      />
    );
    expect(markup).toContain("保存课程目录");
  });
});

describe("AI source panels collapse by default", () => {
  it("keeps lesson-plan document sections collapsed with a summary", () => {
    const markup = renderToStaticMarkup(
      <AiAppGenerator
        courseId="course-1"
        app={app("lesson_plan")}
        chapters={[]}
        approvedQuestions={[]}
        coursewareSources={[]}
        documentSources={[{ id: "doc-1", title: "文化市场营销.pptx", sections: [{ id: "s1", title: "导言" }, { id: "s2", title: "第一章" }] }]}
        initialArtifacts={[]}
      />
    );
    expect(markup).toContain("文化市场营销.pptx");
    // Sections stay hidden until the document row is expanded.
    expect(markup).not.toContain("导言");
    expect(markup).not.toContain(">第一章<");
    expect(markup).toContain("未选择");
    expect(markup).toContain("展开");
  });

  it("keeps the courseware source lesson plan collapsed while pre-selecting preferredSourceId", () => {
    const markup = renderToStaticMarkup(
      <AiAppGenerator
        courseId="course-1"
        app={app("courseware")}
        chapters={[]}
        approvedQuestions={[]}
        coursewareSources={[{ id: "lesson-1", title: "文化市场营销教案", version: 1, status: "APPROVED" }]}
        preferredSourceId="lesson-1"
        initialArtifacts={[]}
      />
    );
    expect(markup).toContain("当前：文化市场营销教案 · v1");
    expect(markup).toContain("点击展开选择来源教案");
    // The selector itself is inside the collapsed panel.
    expect(markup).not.toContain("请选择已确认教案");
    // Manual slide-count control is always available.
    expect(markup).toContain("课件页数");
  });

  it("shows a top Edit affordance for an approved lesson plan without a footer save", () => {
    const markup = renderToStaticMarkup(
      <AiAppGenerator
        courseId="course-1"
        app={app("lesson_plan")}
        chapters={[]}
        approvedQuestions={[]}
        coursewareSources={[]}
        initialArtifacts={[{
          ...baseArtifact,
          status: "APPROVED",
          payload: JSON.stringify({ objectives: ["目标"], keyPoints: ["重点"], teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }], assessment: ["测验"] })
        }]}
      />
    );
    expect(markup).toContain(">编辑<");
    // View state renders no save button (top save appears only while editing).
    expect(markup).not.toContain(">保存<");
  });
});

describe("slide-count recommendation guards", () => {
  it("only applies a response that matches the requested source", () => {
    expect(isRecommendationForSource("lesson-1", "lesson-1")).toBe(true);
    expect(isRecommendationForSource("lesson-2", "lesson-1")).toBe(false);
    expect(isRecommendationForSource(undefined, "lesson-1")).toBe(false);
  });

  it("auto-fills only when the teacher has not touched the control", () => {
    expect(shouldAutoApplyRecommendation(false)).toBe(true);
    expect(shouldAutoApplyRecommendation(true)).toBe(false);
  });
});
