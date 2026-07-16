import type { CourseAiAppType, CourseWorkspaceTab } from "@/types/courseWorkspace";

export type CourseCapabilityAudience = "teacher" | "student";
export type CourseCapabilityGroup = "create" | "manage" | "support";
export type CourseCapabilityPrerequisite = "course_content" | "approved_questions" | "approved_courseware";
export type CourseCapabilityIcon =
  | "document-import"
  | "lesson-plan"
  | "question-generation"
  | "paper-assembly"
  | "courseware"
  | "interactive-courseware"
  | "resources"
  | "knowledge-map"
  | "published-courseware"
  | "tutor";

export type CourseCapability = {
  id: string;
  title: string;
  description: string;
  route: (courseId: string) => string;
  audience: CourseCapabilityAudience[];
  group: CourseCapabilityGroup;
  enabled: boolean;
  activeTab: CourseWorkspaceTab;
  navParent: CourseWorkspaceTab;
  icon: CourseCapabilityIcon;
  appType?: CourseAiAppType;
  color?: "purple" | "blue" | "pink" | "orange" | "green";
  prerequisites?: CourseCapabilityPrerequisite[];
};

export const courseCapabilities: CourseCapability[] = [
  {
    id: "ai-document-course",
    title: "AI文档建课",
    description: "上传教案或课程文档，生成可编辑的课程结构与知识图谱。",
    route: (courseId) => `/space/courses/${courseId}/ai-import`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "document-import"
  },
  {
    id: "ai-lesson-plan",
    appType: "lesson_plan",
    title: "AI教案",
    description: "根据课程资料生成可编辑、可确认的教学设计。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/lesson_plan`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "lesson-plan",
    color: "pink",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-question-generation",
    appType: "question_generation",
    title: "AI出题",
    description: "按知识范围、题型和难度生成题目，确认后进入题库。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/question_generation`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "question-generation",
    color: "blue",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-paper-assembly",
    appType: "paper_assembly",
    title: "AI组卷",
    description: "从已审核题库中选题，生成结构完整的测验卷。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/paper_assembly`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "paper-assembly",
    color: "purple",
    prerequisites: ["approved_questions"]
  },
  {
    id: "ai-courseware",
    appType: "courseware",
    title: "生成 AI课件",
    description: "基于课程资料生成可逐页编辑和确认的课堂课件。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/courseware`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "courseware",
    color: "purple",
    prerequisites: ["course_content"]
  },
  {
    id: "ai-interactive-courseware",
    appType: "html_courseware",
    title: "生成互动课件",
    description: "将已确认的 AI课件转换为可播放的互动课堂版本。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/html_courseware`,
    audience: ["teacher"],
    group: "create",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "interactive-courseware",
    color: "blue",
    prerequisites: ["approved_courseware"]
  },
  {
    id: "course-resources",
    title: "课程资料库",
    description: "集中查看和管理课件、案例、项目与参考资料。",
    route: (courseId) => `/space/courses/${courseId}/resources`,
    audience: ["teacher"],
    group: "manage",
    enabled: true,
    activeTab: "resources",
    navParent: "ai-workbench",
    icon: "resources"
  },
  {
    id: "course-knowledge-map",
    title: "知识图谱",
    description: "查看课程知识节点、结构关系与教学目标之间的联系。",
    route: (courseId) => `/space/courses/${courseId}/knowledge-map`,
    audience: ["teacher"],
    group: "manage",
    enabled: true,
    activeTab: "knowledge-map",
    navParent: "ai-workbench",
    icon: "knowledge-map"
  },
  {
    id: "published-interactive-courseware",
    title: "已发布互动课件",
    description: "查看当前已发布给学生的互动课件成果。",
    route: (courseId) => `/space/courses/${courseId}/html-courseware`,
    audience: ["teacher"],
    group: "manage",
    enabled: true,
    activeTab: "html-courseware",
    navParent: "ai-workbench",
    icon: "published-courseware"
  },
  {
    id: "ai-tutor",
    title: "AI助教",
    description: "基于当前课程资料问答，并定位引用来源。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/tutor`,
    audience: ["teacher", "student"],
    group: "support",
    enabled: true,
    activeTab: "ai-workbench",
    navParent: "ai-workbench",
    icon: "tutor"
  }
];

export const enabledGeneratorCapabilities = courseCapabilities.filter(
  (capability): capability is CourseCapability & { appType: CourseAiAppType } => capability.enabled && Boolean(capability.appType)
);

export function getCourseCapabilityByAppType(appType: CourseAiAppType) {
  return enabledGeneratorCapabilities.find((capability) => capability.appType === appType);
}
