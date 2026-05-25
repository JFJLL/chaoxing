export type GeneratedCourseOutline = {
  title: string;
  description: string;
  targetAudience: string;
  learningObjectives: string[];
  chapters: Array<{
    title: string;
    summary: string;
    order: number;
    lessons: Array<{
      title: string;
      summary: string;
      order: number;
      estimatedMinutes: number;
      keyPoints: string[];
      suggestedActivities: string[];
      assessmentPrompts: string[];
    }>;
  }>;
};

export type CourseDirectoryNode = {
  id: string;
  title: string;
  summary: string;
  order: number;
  lessons: CourseLessonNode[];
};

export type CourseLessonNode = {
  id: string;
  title: string;
  summary: string;
  order: number;
  estimatedMinutes: number;
  keyPoints: string[];
  suggestedActivities: string[];
  assessmentPrompts: string[];
};
