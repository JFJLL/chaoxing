import type { CourseAiAppType } from "@/types/courseWorkspace";
import { enabledGeneratorCapabilities, type CourseCapabilityPrerequisite } from "@/lib/courseWorkspace/capabilities";

export type CourseAiAppDefinition = {
  key: string;
  appType?: CourseAiAppType;
  title: string;
  description: string;
  category: "全部应用" | "备课中心" | "教学神器" | "学习助手" | "资料科研";
  color: "purple" | "blue" | "pink" | "orange" | "green";
  enabled: boolean;
  prerequisites?: CourseCapabilityPrerequisite[];
};

export const courseAiApps: CourseAiAppDefinition[] = enabledGeneratorCapabilities.map((capability) => ({
  key: capability.id,
  appType: capability.appType,
  title: capability.title,
  description: capability.description,
  category: "备课中心",
  color: capability.color ?? "blue",
  enabled: true,
  prerequisites: capability.prerequisites
}));

export function getCourseAiAppDefinition(appType: CourseAiAppType) {
  const app = courseAiApps.find((item) => item.appType === appType);
  if (!app && appType === "html_courseware") {
    return {
      key: "legacy-html-courseware",
      appType,
      title: "历史 HTML 课件",
      description: "历史互动课件仅保留查看，不再生成新的 HTML 内容。",
      category: "备课中心",
      color: "blue",
      enabled: true,
      prerequisites: ["approved_courseware"]
    } satisfies CourseAiAppDefinition;
  }
  if (!app) {
    throw new Error(`不支持的 AI 应用类型：${appType}`);
  }
  return app;
}

export const enabledCourseAiAppTypes = courseAiApps
  .filter((app): app is CourseAiAppDefinition & { appType: CourseAiAppType } => app.enabled && Boolean(app.appType))
  .map((app) => app.appType);
