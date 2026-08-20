import { z } from "zod";
import { isValidChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export type CourseAiAppType =
  | "question_generation"
  | "lesson_plan"
  | "courseware"
  | "paper_assembly"
  | "ppt_courseware"
  | "html_courseware";

export type CourseWorkspaceTab =
  | "ai-workbench"
  | "ai-assistant"
  | "pre-class"
  | "activities"
  | "after-class"
  | "enterprise-challenges"
  | "innovation-market"
  | "field-study"
  | "mentor-reviews"
  | "analytics"
  | "structure"
  | "knowledge-map"
  | "html-courseware"
  | "drive"
  | "resources"
  | "notices"
  | "discussions"
  | "assignments"
  | "exams"
  | "question-bank";

const nonEmptyText = z.string().trim().min(1).max(10_000);

const aiQuestionSchema = z
  .object({
    id: nonEmptyText.max(200).optional(),
    type: z.enum(["single_choice", "multiple_choice", "short_answer"]),
    stem: nonEmptyText,
    options: z.array(nonEmptyText).min(2).max(12).optional(),
    answer: nonEmptyText,
    explanation: nonEmptyText
  })
  .strict()
  .superRefine((question, context) => {
    if (question.type !== "short_answer" && !question.options) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "选择题必须提供选项"
      });
    } else if (question.type !== "short_answer" && question.options && !isValidChoiceAnswer(question.answer, question.options, question.type === "multiple_choice")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "标准答案必须对应已有选项"
      });
    }
  });

export const aiQuestionPayloadSchema = z
  .object({
    questions: z.array(aiQuestionSchema).min(1).max(100)
  })
  .strict();

export const aiLessonPlanPayloadSchema = z
  .object({
    objectives: z.array(nonEmptyText).min(1).max(30),
    keyPoints: z.array(nonEmptyText).min(1).max(50),
    teachingProcess: z
      .array(
        z
          .object({
            phase: nonEmptyText.max(100),
            minutes: z.number().int().min(1).max(480),
            activity: nonEmptyText
          })
          .strict()
      )
      .min(1)
      .max(30),
    assessment: z.array(nonEmptyText).min(1).max(30)
  })
  .strict();

export const aiCoursewarePayloadSchema = z
  .object({
    slides: z
      .array(
        z
          .object({
            title: nonEmptyText.max(300),
            bullets: z.array(nonEmptyText).min(1).max(20),
            speakerNotes: nonEmptyText,
            imagePath: z.string().trim().min(1).max(2_000).optional()
          })
          .strict()
      )
      .min(1)
      .max(50)
  })
  .strict();

export const aiPaperPayloadSchema = z
  .object({
    title: nonEmptyText.max(300),
    sections: z
      .array(
        z
          .object({
            name: nonEmptyText.max(200),
            score: z.number().finite().positive().max(1_000),
            questionIds: z.array(nonEmptyText.max(200)).min(1).max(200)
          })
          .strict()
      )
      .min(1)
      .max(30)
  })
  .strict();

export const htmlCoursewarePayloadSchema = z
  .object({
    html: nonEmptyText.max(2_000_000),
    slideCount: z.number().int().min(1).max(50),
    sourceMapId: nonEmptyText.max(200).optional(),
    theme: nonEmptyText.max(200).optional(),
    generatedAt: z.string().datetime()
  })
  .strict();

export type AiQuestionPayload = z.infer<typeof aiQuestionPayloadSchema>;
export type AiLessonPlanPayload = z.infer<typeof aiLessonPlanPayloadSchema>;
export type AiCoursewarePayload = z.infer<typeof aiCoursewarePayloadSchema>;
export type AiPaperPayload = z.infer<typeof aiPaperPayloadSchema>;
export type HtmlCoursewarePayload = z.infer<typeof htmlCoursewarePayloadSchema>;

export type CourseAiArtifactPayload =
  | AiQuestionPayload
  | AiLessonPlanPayload
  | AiCoursewarePayload
  | AiPaperPayload
  | HtmlCoursewarePayload;
