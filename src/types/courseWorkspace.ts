export type CourseAiAppType = "question_generation" | "lesson_plan" | "courseware" | "paper_assembly" | "html_courseware";

export type CourseWorkspaceTab =
  | "ai-workbench"
  | "activities"
  | "structure"
  | "knowledge-map"
  | "html-courseware"
  | "resources"
  | "notices"
  | "discussions"
  | "assignments"
  | "exams"
  | "question-bank";

export type AiQuestionPayload = {
  questions: Array<{
    id?: string;
    type: "single_choice" | "multiple_choice" | "short_answer";
    stem: string;
    options?: string[];
    answer: string;
    explanation: string;
  }>;
};

export type AiLessonPlanPayload = {
  objectives: string[];
  keyPoints: string[];
  teachingProcess: Array<{ phase: string; minutes: number; activity: string }>;
  assessment: string[];
};

export type AiCoursewarePayload = {
  slides: Array<{ title: string; bullets: string[]; speakerNotes: string }>;
};

export type AiPaperPayload = {
  title: string;
  sections: Array<{ name: string; score: number; questionIds: string[] }>;
};

export type HtmlCoursewarePayload = {
  html: string;
  slideCount: number;
  sourceMapId?: string;
  theme?: string;
  generatedAt: string;
};

export type CourseAiArtifactPayload =
  | AiQuestionPayload
  | AiLessonPlanPayload
  | AiCoursewarePayload
  | AiPaperPayload
  | HtmlCoursewarePayload;
