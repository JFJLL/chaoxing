import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  Clock3,
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
  { id: "pre-class", label: "课前准备", hrefSegment: "pre-class", icon: Clock3 },
  { id: "activities", label: "上课", hrefSegment: "activities", icon: CalendarDays },
  { id: "after-class", label: "课后", hrefSegment: "after-class", icon: ClipboardList },
  { id: "notices", label: "通知", hrefSegment: "notices", icon: Volume2 },
  { id: "analytics", label: "学情分析", hrefSegment: "analytics", icon: BarChart3 }
];
