import { describe, expect, it } from "vitest";
import { courseAiApps, enabledCourseAiAppTypes, getCourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { buildKnowledgeMapDraft } from "@/lib/knowledgeMap/generateKnowledgeMap";
import type { CourseAiAppType } from "@/types/courseWorkspace";
import { courseCapabilities, enabledGeneratorCapabilities, teacherPrepWorkflows } from "@/lib/courseWorkspace/capabilities";

const appTypes: CourseAiAppType[] = ["question_generation", "lesson_plan", "courseware", "paper_assembly", "html_courseware"];

describe("course AI apps", () => {
  it("maps each enabled app type to one definition", () => {
    expect(enabledCourseAiAppTypes.sort()).toEqual(appTypes.sort());
    for (const appType of appTypes) {
      const matches = courseAiApps.filter((app) => app.appType === appType);
      expect(matches).toHaveLength(1);
      expect(getCourseAiAppDefinition(appType).enabled).toBe(true);
    }
  });

  it("keeps generator definitions unique while consolidating the teacher homepage into five workflows", () => {
    const enabled = courseCapabilities.filter((capability) => capability.enabled);
    const titles = enabled.map((capability) => capability.title);
    const routes = enabled.map((capability) => capability.route("course-1"));

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(routes).size).toBe(routes.length);
    expect(enabledGeneratorCapabilities.map((capability) => capability.appType).sort()).toEqual(appTypes.sort());
    expect(enabled.find((capability) => capability.id === "ai-paper-assembly")?.prerequisites).toEqual(["approved_questions"]);
    expect(enabled.find((capability) => capability.id === "ai-interactive-courseware")?.title).toBe("生成互动课件");
    expect(teacherPrepWorkflows.map((workflow) => workflow.id)).toEqual(["course-content", "lesson-plan", "assessment", "courseware", "tutor"]);
    expect(teacherPrepWorkflows.find((workflow) => workflow.id === "assessment")?.includes).toEqual(["生成题目", "审核题库", "智能组卷"]);
    expect(teacherPrepWorkflows.find((workflow) => workflow.id === "courseware")?.includes).toEqual(["生成课件", "互动课件", "已发布课件"]);
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

});
