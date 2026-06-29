import { describe, expect, it } from "vitest";
import { courseAiApps, enabledCourseAiAppTypes, getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { generateCourseAiArtifact } from "@/lib/courseWorkspace/generateAiArtifact";
import { buildKnowledgeMapDraft } from "@/lib/knowledgeMap/generateKnowledgeMap";
import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload,
  CourseAiAppType,
  HtmlCoursewarePayload
} from "@/types/courseWorkspace";

const appTypes: CourseAiAppType[] = ["question_generation", "lesson_plan", "courseware", "paper_assembly"];

const input = {
  courseTitle: "功能体验课",
  chapters: [
    {
      title: "第一章 平台导览",
      lessons: [
        { title: "个人空间导航", summary: "认识首页、课程、收件箱和云盘。" },
        { title: "课程任务点", summary: "理解章节、课时、资料和任务点完成状态。" }
      ]
    }
  ]
};

describe("course AI apps", () => {
  it("maps each enabled app type to one definition", () => {
    expect(enabledCourseAiAppTypes.sort()).toEqual(appTypes.sort());
    for (const appType of appTypes) {
      const matches = courseAiApps.filter((app) => app.appType === appType);
      expect(matches).toHaveLength(1);
      expect(getCourseAiAppDefinition(appType).enabled).toBe(true);
    }
  });

  it("generates question payloads", () => {
    const payload = generateCourseAiArtifact({ ...input, appType: "question_generation", prompt: "题型：单选；题量：7；难度：提高" }) as AiQuestionPayload;
    expect(payload.questions).toHaveLength(7);
    expect(payload.questions.every((question) => question.type === "single_choice")).toBe(true);
    expect(payload.questions[0]?.stem).toContain("个人空间导航");
  });

  it("generates lesson plan payloads", () => {
    const payload = generateCourseAiArtifact({ ...input, appType: "lesson_plan" }) as AiLessonPlanPayload;
    expect(payload.objectives.length).toBeGreaterThan(0);
    expect(payload.teachingProcess.map((phase) => phase.phase)).toContain("实践");
  });

  it("generates courseware payloads", () => {
    const payload = generateCourseAiArtifact({ ...input, appType: "courseware", prompt: "页数：9；风格：案例分析" }) as AiCoursewarePayload;
    expect(payload.slides).toHaveLength(9);
    expect(payload.slides[0]?.title).toBe("功能体验课");
    expect(payload.slides[0]?.bullets).toContain("案例分析风格");
  });

  it("generates playable HTML courseware payloads", () => {
    const payload = generateCourseAiArtifact({ ...input, appType: "html_courseware", prompt: "页数：5；风格：课堂播放" }) as HtmlCoursewarePayload;
    expect(payload.slideCount).toBe(5);
    expect(payload.html).toContain("<!doctype html>");
    expect(payload.html).toContain("ArrowRight");
    expect(payload.html).toContain("class=\"controls\"");
    expect(payload.html).toContain("content-grid");
  });

  it("builds relational knowledge maps beyond a plain outline", () => {
    const draft = buildKnowledgeMapDraft({
      title: "功能体验课",
      description: "用于验证课程平台功能体验的课程。",
      targetAudience: "教师",
      learningObjectives: ["理解平台导航", "完成任务点设计", "评价学习结果"],
      chapters: [
        {
          title: "第一章 平台导览",
          summary: "认识课程空间结构。",
          order: 1,
          lessons: [
            {
              title: "个人空间导航",
              summary: "认识首页、课程、收件箱和云盘。",
              order: 1,
              estimatedMinutes: 30,
              keyPoints: ["首页入口", "课程入口"],
              suggestedActivities: ["在课程空间中定位云盘资料"],
              assessmentPrompts: ["说明课程入口和云盘入口的区别"]
            }
          ]
        }
      ]
    });

    expect(draft.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(["objective", "activity", "assessment"]));
    expect(draft.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(["outcome", "practice", "checks", "applies", "evaluates"]));
  });

  it("generates paper assembly payloads", () => {
    const payload = generateCourseAiArtifact({ ...input, appType: "paper_assembly" }) as AiPaperPayload;
    expect(payload.title).toContain("功能体验课");
    expect(payload.sections.length).toBeGreaterThan(0);
  });

  it("throws a readable error for unsupported app types", () => {
    expect(() =>
      generateCourseAiArtifact({
        ...input,
        appType: "unknown" as CourseAiAppType
      })
    ).toThrow("不支持的 AI 应用类型");
  });
});
