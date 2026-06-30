import type { CourseAiAppType } from "@/types/courseWorkspace";

export type CourseAiAppDefinition = {
  key: string;
  appType?: CourseAiAppType;
  title: string;
  description: string;
  category: "全部应用" | "备课中心" | "教学神器" | "学习助手" | "资料科研";
  color: "purple" | "blue" | "pink" | "orange" | "green";
  enabled: boolean;
};

export const courseAiApps: CourseAiAppDefinition[] = [
  { key: "resource-assistant", title: "资料助手", description: "AI助教右边的资料助手移动到这里啦！也可以通过页面右上角搜索使用", category: "资料科研", color: "purple", enabled: false },
  { key: "research-assistant", title: "AI科研助手", description: "闻见真知，道通天下", category: "资料科研", color: "purple", enabled: false },
  { key: "ai-question", appType: "question_generation", title: "AI出题", description: "AI出题，全面高效，精准把握知识点", category: "教学神器", color: "blue", enabled: true },
  { key: "ai-coach", title: "AI陪练", description: "个性化出题，助你巩固基础，突破难点", category: "学习助手", color: "blue", enabled: false },
  { key: "ai-paper", appType: "paper_assembly", title: "AI组卷", description: "召唤智能组卷小助手，三步生成优质试卷", category: "教学神器", color: "purple", enabled: true },
  { key: "ai-lesson-plan", appType: "lesson_plan", title: "AI教案", description: "AI辅助，智能备课，智慧教学新选择", category: "备课中心", color: "pink", enabled: true },
  { key: "program-test", title: "程序题自测", description: "实时评估编程技能，提升代码水平", category: "教学神器", color: "orange", enabled: false },
  { key: "ai-writing-review", title: "AI写作批阅", description: "基于人工智能技术，自动对学生的写作内容进行评分和反馈", category: "教学神器", color: "orange", enabled: false },
  { key: "ai-courseware", appType: "courseware", title: "AI课件", description: "轻松一点，即刻创建专业级教学PPT", category: "备课中心", color: "purple", enabled: true },
  { key: "ai-html-courseware", appType: "html_courseware", title: "HTML课件", description: "使用当前 Gemini 能力生成可播放的互动课堂课件", category: "备课中心", color: "blue", enabled: true },
  { key: "formula-recognition", title: "公式识别", description: "识别图片和文档中的公式内容", category: "教学神器", color: "green", enabled: false },
  { key: "smart-numbering", title: "智能编号", description: "自动整理题目和材料编号", category: "教学神器", color: "blue", enabled: false },
  { key: "homework-check", title: "作业查重", description: "辅助发现作业中的重复内容", category: "教学神器", color: "green", enabled: false }
];

export function getCourseAiAppDefinition(appType: CourseAiAppType) {
  const app = courseAiApps.find((item) => item.appType === appType);
  if (!app) {
    throw new Error(`不支持的 AI 应用类型：${appType}`);
  }
  return app;
}

export const enabledCourseAiAppTypes = courseAiApps
  .filter((app): app is CourseAiAppDefinition & { appType: CourseAiAppType } => app.enabled && Boolean(app.appType))
  .map((app) => app.appType);
