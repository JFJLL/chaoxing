import {
  Bot,
  CalendarDays,
  ClipboardList,
  Folder,
  LayoutList,
  MessageCircle,
  PenLine,
  ScrollText,
  Volume2
} from "lucide-react";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";

export const courseWorkspaceNav: Array<{
  id: CourseWorkspaceTab;
  label: string;
  hrefSegment: string;
  icon: typeof Bot;
}> = [
  { id: "ai-workbench", label: "AI工作台", hrefSegment: "ai-workbench", icon: Bot },
  { id: "activities", label: "班级活动", hrefSegment: "activities", icon: CalendarDays },
  { id: "structure", label: "课程结构", hrefSegment: "structure", icon: LayoutList },
  {
    id: "resources",
    label: "课程资料库",
    hrefSegment: "resources",
    icon: Folder
  },
  { id: "notices", label: "通知", hrefSegment: "notices", icon: Volume2 },
  { id: "discussions", label: "讨论", hrefSegment: "discussions", icon: MessageCircle },
  { id: "assignments", label: "作业", hrefSegment: "assignments", icon: PenLine },
  { id: "exams", label: "考试", hrefSegment: "exams", icon: ClipboardList },
  { id: "question-bank", label: "题库", hrefSegment: "question-bank", icon: ScrollText }
];
