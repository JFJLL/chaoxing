import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  HardDrive,
  Sparkles,
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
  { id: "ai-assistant", label: "AI助教", hrefSegment: "ai-assistant", icon: Sparkles },
  { id: "activities", label: "上课", hrefSegment: "activities", icon: CalendarDays },
  { id: "after-class", label: "课后", hrefSegment: "after-class", icon: ClipboardList },
  { id: "notices", label: "通知", hrefSegment: "notices", icon: Volume2 },
  { id: "analytics", label: "学情分析", hrefSegment: "analytics", icon: BarChart3 },
  { id: "drive", label: "云盘", hrefSegment: "drive", icon: HardDrive }
];

const courseWorkspaceNavParents: Record<CourseWorkspaceTab, CourseWorkspaceTab> = {
  "ai-workbench": "ai-workbench",
  "ai-assistant": "ai-assistant",
  "pre-class": "after-class",
  activities: "activities",
  "after-class": "after-class",
  "enterprise-challenges": "after-class",
  "innovation-market": "after-class",
  "field-study": "after-class",
  "mentor-reviews": "after-class",
  analytics: "analytics",
  drive: "drive",
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
