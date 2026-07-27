import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ArtifactConfirmationNotice,
  AiAppGenerator,
  buildArtifactExportRequest,
  canConfirmAiArtifact,
  getAiArtifactStatusText,
  mergeArtifactHistory
} from "../../src/components/course-workspace/AiAppGenerator";
import type { ManagerAiArtifactDto } from "../../src/lib/courseWorkspace/aiArtifactClient";
import type { CourseAiAppDefinition } from "../../src/lib/courseWorkspace/aiApps";
import type { CourseAiAppType } from "../../src/types/courseWorkspace";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const app: CourseAiAppDefinition & { appType: CourseAiAppType } = {
  key: "ai-question-generation",
  appType: "question_generation" as const,
  title: "AI出题",
  description: "生成题目",
  category: "备课中心",
  color: "blue",
  enabled: true
};

const baseArtifact: ManagerAiArtifactDto = {
  id: "artifact-1",
  seriesId: "series-1",
  appType: "question_generation",
  title: "题目",
  prompt: null,
  payload: null,
  scope: JSON.stringify({ kind: "course" }),
  status: "QUEUED",
  version: 1,
  errorCode: null,
  errorMessage: null,
  sourceJobId: null,
  sourceArtifactId: null,
  jobsAhead: 2,
  startedAt: null,
  finishedAt: null,
  approvedAt: null,
  publishedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

function render(
  artifact: ManagerAiArtifactDto,
  appOverride: CourseAiAppDefinition & { appType: CourseAiAppType } = app,
  options: {
    approvedQuestions?: Array<{ id: string; stem: string }>;
    coursewareSources?: Array<{ id: string; title: string; version: number; status: string }>;
    hasCourseContent?: boolean;
  } = {}
) {
  return renderToStaticMarkup(
    <AiAppGenerator
      courseId="course-1"
      app={appOverride}
      chapters={[{ id: "chapter-1", title: "第一章" }]}
      approvedQuestions={options.approvedQuestions ?? []}
      coursewareSources={options.coursewareSources ?? []}
      initialArtifacts={[artifact]}
      hasCourseContent={options.hasCourseContent}
    />
  );
}

describe("AI artifact status presentation", () => {
  it("sends only the strict export fields and never leaks the display label", () => {
    const choice = {
      label: "学生版 Word",
      format: "DOCX",
      variant: "STUDENT"
    } as const;
    const request = buildArtifactExportRequest(choice);

    expect(request).toEqual({ format: "DOCX", variant: "STUDENT" });
    expect(request).not.toHaveProperty("label");
  });

  it.each([
    ["DRAFT", false, false, true],
    ["DRAFT", true, false, false],
    ["DRAFT", false, true, false],
    ["APPROVED", false, false, false]
  ] as const)("gates confirmation for %s dirty=%s busy=%s", (status, dirty, busy, expected) => {
    expect(canConfirmAiArtifact(status, dirty, busy)).toBe(expected);
  });

  it("renders an explicit unsaved-changes confirmation warning", () => {
    const markup = renderToStaticMarkup(<ArtifactConfirmationNotice dirty />);
    expect(markup).toContain("有未保存修改，请先保存后再确认");
  });

  it.each([
    [{ status: "QUEUED", jobsAhead: 3 }, "前方还有 3 个任务"],
    [{ status: "QUEUED", jobsAhead: 0 }, "即将开始生成"],
    [{ status: "QUEUED", jobsAhead: null }, "等待系统处理"],
    [{ status: "GENERATING", jobsAhead: null }, "AI 正在生成内容"],
    [{ status: "DRAFT", jobsAhead: null }, "草稿待编辑确认"],
    [{ status: "FAILED", jobsAhead: null }, "AI 调用失败"],
    [{ status: "APPROVED", jobsAhead: null }, "内容已确认"],
    [{ status: "PUBLISHED", jobsAhead: null }, "已发布给学生"],
    [{ status: "ARCHIVED", jobsAhead: null }, "历史版本" ]
  ] as const)("maps %s to a stable label", (state, label) => {
    expect(getAiArtifactStatusText(state)).toBe(label);
  });

  it("renders active progress with an accessible status and hidden spinner", () => {
    const markup = render(baseArtifact);
    expect(markup).toContain("前方还有 2 个任务");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("animate-spin");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("renders an explicit safe failure and retry action without a template fallback", () => {
    const markup = render({
      ...baseArtifact,
      status: "FAILED",
      jobsAhead: null,
      errorCode: "MODEL_TIMEOUT",
      errorMessage: "AI 服务响应超时，请重试"
    });
    expect(markup).toContain("AI 服务响应超时，请重试");
    expect(markup).toContain("重试 AI 生成");
    expect(markup).not.toContain("模板");
  });

  it("renders history and a saved draft as read-only until editing is requested", () => {
    const markup = render({
      ...baseArtifact,
      status: "DRAFT",
      jobsAhead: null,
      payload: JSON.stringify({ questions: [{
        id: "question_123e4567-e89b-12d3-a456-426614174000",
        type: "short_answer",
        stem: "问题",
        answer: "答案",
        explanation: "解析"
      }] }),
      version: 2
    });
    expect(markup).toContain("历史产物");
    expect(markup).toContain("编辑");
    expect(markup).not.toContain(">保存<");
    expect(markup).toContain("确认内容");
    expect(markup).not.toContain("发布给学生");
  });

  it("allows an approved lesson plan to be published", () => {
    const markup = render({
      ...baseArtifact,
      appType: "lesson_plan",
      status: "APPROVED",
      jobsAhead: null,
      payload: JSON.stringify({ objectives: ["目标"], keyPoints: ["重点"], teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }], assessment: ["测验"] })
    }, { ...app, key: "ai-lesson-plan", appType: "lesson_plan", title: "教案", description: "生成教案" });
    expect(markup).toContain("发布给学生");
  });

  it("blocks paper generation until at least three approved questions exist", () => {
    const markup = render({ ...baseArtifact, appType: "paper_assembly" }, {
      ...app,
      key: "ai-paper-assembly",
      appType: "paper_assembly",
      title: "AI 组卷",
      description: "组卷"
    }, {
      approvedQuestions: [{ id: "q-1", stem: "一" }, { id: "q-2", stem: "二" }]
    });

    expect(markup).toContain("已审核题目 2 道");
    expect(markup).toContain("请先生成并审核至少 3 道题目");
    expect(markup).toContain("去 AI出题");
    expect(markup).toContain("审核题库");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(markup).not.toContain("模板");
  });

  it("keeps legacy HTML courseware read-only and stops new generation", () => {
    const htmlApp = {
      ...app,
      key: "ai-html-courseware",
      appType: "html_courseware" as const,
      title: "HTML 课件",
      description: "生成 HTML"
    };
    const emptyMarkup = render({ ...baseArtifact, appType: "html_courseware" }, htmlApp);
    expect(emptyMarkup).toContain("HTML 互动课件已停止生成");
    expect(emptyMarkup).toContain("请改用 PPT 课件");
    expect(emptyMarkup).toContain('<form class="hidden">');

    const readyMarkup = render({ ...baseArtifact, appType: "html_courseware" }, htmlApp, {
      coursewareSources: [{ id: "courseware-1", title: "第一章课件", version: 2, status: "APPROVED" }]
    });
    expect(readyMarkup).toContain("HTML 互动课件已停止生成");
  });

  it("does not suggest starting a new legacy HTML courseware artifact when history is empty", () => {
    const htmlApp = {
      ...app,
      key: "ai-html-courseware",
      appType: "html_courseware" as const,
      title: "HTML 课件",
      description: "历史 HTML"
    };
    const markup = renderToStaticMarkup(
      <AiAppGenerator
        courseId="course-1"
        app={htmlApp}
        chapters={[]}
        approvedQuestions={[]}
        coursewareSources={[]}
        initialArtifacts={[]}
      />
    );

    expect(markup).toContain("暂无历史 HTML 课件");
    expect(markup).toContain("请使用 PPT 课件");
    expect(markup).not.toContain("准备开始HTML 课件");
    expect(markup).not.toContain("填写生成要求 → AI 生成草稿");
  });

  it("blocks source-based generation when the course has no usable content and provides next steps", () => {
    const markup = render(baseArtifact, app, { hasCourseContent: false });

    expect(markup).toContain("当前课程还没有可用于 AI 生成的内容");
    expect(markup).toContain("AI文档建课");
    expect(markup).toContain("查看课程资料库");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("turns an approved AI courseware snapshot into PPT without a second AI generation form", () => {
    const pptApp = {
      ...app,
      key: "ai-ppt-courseware",
      appType: "ppt_courseware" as const,
      title: "PPT课件",
      description: "将已有课件转换为 PPT"
    };
    const markup = render({ ...baseArtifact, appType: "ppt_courseware", status: "APPROVED" }, pptApp, {
      coursewareSources: [{ id: "courseware-1", title: "第一章课件", version: 2, status: "APPROVED" }]
    });

    expect(markup).toContain("直接将已有课件转换为 PPT");
    expect(markup).toContain("不会再次调用 AI 生成内容");
    expect(markup).toContain("生成并下载 PPT");
    expect(markup).not.toContain("生成要求");
    expect(markup).not.toContain("开始 AI 生成");
    expect(markup).not.toContain("内容范围");
    expect(markup).not.toContain(">难度<");
  });
});

describe("AI artifact history merge", () => {
  it("replaces only the same history row without mutating sibling rows", () => {
    const oldPublished = { ...baseArtifact, id: "old", status: "PUBLISHED" as const };
    const otherPublished = { ...baseArtifact, id: "other", seriesId: "series-2", status: "PUBLISHED" as const };
    const published = { ...baseArtifact, id: "new", status: "PUBLISHED" as const, version: 2 };

    expect(mergeArtifactHistory([oldPublished, otherPublished], published)).toEqual([
      published,
      oldPublished,
      otherPublished
    ]);
  });
});
