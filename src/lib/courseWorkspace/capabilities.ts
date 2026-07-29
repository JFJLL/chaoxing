import type { CourseAiAppType } from "@/types/courseWorkspace";

export type CourseCapabilityPrerequisite = "course_content" | "approved_questions" | "approved_courseware";

export type CourseGeneratorCapability = {
  id: string;
  appType: CourseAiAppType;
  title: string;
  description: string;
  route: (courseId: string) => string;
  enabled: boolean;
  color: "purple" | "blue" | "pink" | "orange" | "green";
  prerequisites: CourseCapabilityPrerequisite[];
};

export type TeacherPrepWorkflowIcon = "content" | "lesson-plan" | "assessment" | "courseware";

export type TeacherPrepWorkflow = {
  id: string;
  title: string;
  description: string;
  route: (courseId: string) => string;
  icon: TeacherPrepWorkflowIcon;
  includes: string[];
};

export const courseCapabilities: CourseGeneratorCapability[] = [
  {
    id: "ai-lesson-plan",
    appType: "lesson_plan",
    title: "AI教案",
    description: "根据课程资料生成可编辑、可确认的教学设计。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/lesson_plan`,
    enabled: true,
    color: "pink",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-question-generation",
    appType: "question_generation",
    title: "AI出题",
    description: "按知识范围、题型和难度生成题目，确认后进入题库。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/question_generation`,
    enabled: true,
    color: "blue",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-paper-assembly",
    appType: "paper_assembly",
    title: "AI组卷",
    description: "从已审核题库中选题，生成结构完整的测验卷。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/paper_assembly`,
    enabled: true,
    color: "purple",
    prerequisites: ["approved_questions"]
  },
  {
    id: "ai-courseware",
    appType: "courseware",
    title: "生成 AI课件",
    description: "基于已确认教案生成可逐页编辑和确认的课堂课件。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/courseware`,
    enabled: true,
    color: "purple",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-ppt-courseware",
    appType: "ppt_courseware",
    title: "PPT课件",
    description: "将已确认的 AI课件套用课程模板并导出为 PPTX。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/ppt_courseware`,
    enabled: true,
    color: "blue",
    prerequisites: ["approved_courseware"]
  }
];

export const teacherPrepWorkflows: TeacherPrepWorkflow[] = [
  {
    id: "course-content",
    title: "课程内容与知识",
    description: "导入课程文档，维护 AI 使用的课程资料，并检查知识结构。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/content`,
    icon: "content",
    includes: ["文档建课", "课程资料", "知识图谱"]
  },
  {
    id: "lesson-plan",
    title: "AI教案",
    description: "围绕课程内容生成教学目标、重点、教学环节与评价方式。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/lesson_plan`,
    icon: "lesson-plan",
    includes: ["生成教案", "编辑确认"]
  },
  {
    id: "courseware",
    title: "AI课件",
    description: "从已确认教案生成 AI课件，再制作并发布最终 PPT。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/courseware`,
    icon: "courseware",
    includes: ["生成课件", "PPT课件", "发布PPT"]
  },
  {
    id: "assessment",
    title: "AI出题与组卷",
    description: "先生成并审核题目，再使用已确认题库完成智能组卷。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/question_generation`,
    icon: "assessment",
    includes: ["生成题目", "审核题库", "智能组卷"]
  }
];

export const enabledGeneratorCapabilities = courseCapabilities.filter((capability) => capability.enabled);

export function getCourseCapabilityByAppType(appType: CourseAiAppType) {
  return enabledGeneratorCapabilities.find((capability) => capability.appType === appType);
}
