export const COURSE_DRIVE_PURPOSES = {
  COURSE_RESOURCES: "课程资料",
  COURSE_DOCUMENTS: "课程文档",
  CASE_LIBRARY: "案例库",
  PROJECT_LIBRARY: "项目库",
  REFERENCE_VIDEO: "参考视频",
  CONVERSATION_UPLOADS: "对话上传",
  AI_LESSON_PLAN_OUTPUT: "教案",
  AI_QUESTION_OUTPUT: "题目",
  AI_PAPER_OUTPUT: "试卷",
  AI_COURSEWARE_OUTPUT: "课件",
  AI_PPT_OUTPUT: "PPT课件"
} as const;

export type CourseDrivePurpose = keyof typeof COURSE_DRIVE_PURPOSES;

export const RESOURCE_LIBRARY_PURPOSES = {
  case: "CASE_LIBRARY",
  project: "PROJECT_LIBRARY",
  video: "REFERENCE_VIDEO"
} as const satisfies Record<string, CourseDrivePurpose>;

export type ResourceLibraryKind = keyof typeof RESOURCE_LIBRARY_PURPOSES;

export type CourseDriveAccess = "ALLOW" | "DENY";

export const DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "md",
  "pdf",
  "ppt",
  "pptx",
  "rtf",
  "txt",
  "xls",
  "xlsx"
]);

export function isDocumentName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_EXTENSIONS.has(extension);
}
