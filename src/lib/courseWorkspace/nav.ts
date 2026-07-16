import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  Volume2
} from "lucide-react";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";

export const courseWorkspaceNav: Array<{
  id: CourseWorkspaceTab;
  label: string;
  hrefSegment: string;
  icon: typeof Bot;
}> = [
  { id: "ai-workbench", label: "备课中心", hrefSegment: "ai-workbench", icon: Bot },
  { id: "activities", label: "上课", hrefSegment: "activities", icon: CalendarDays },
  { id: "after-class", label: "课后", hrefSegment: "after-class", icon: ClipboardList },
  { id: "notices", label: "通知", hrefSegment: "notices", icon: Volume2 },
  { id: "analytics", label: "学情分析", hrefSegment: "analytics", icon: BarChart3 }
];

const courseWorkspaceNavParents: Record<CourseWorkspaceTab, CourseWorkspaceTab> = {
  "ai-workbench": "ai-workbench",
  "pre-class": "after-class",
  activities: "activities",
  "after-class": "after-class",
  analytics: "analytics",
  structure: "ai-workbench",
  "knowledge-map": "ai-workbench",
  "html-courseware": "ai-workbench",
  resources: "ai-workbench",
  notices: "notices",
  discussions: "after-class",
  assignments: "after-class",
  exams: "after-class",
  "question-bank": "after-class"
};

export function getCourseWorkspaceNavParent(activeTab: CourseWorkspaceTab) {
  return courseWorkspaceNavParents[activeTab];
}
