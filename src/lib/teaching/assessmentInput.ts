import { z } from "zod";
import { isValidChoiceAnswer, normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export const assessmentQuestionInputSchema = z.object({
  id: z.string().optional(),
  sourceQuestionId: z.string().nullable().optional(),
  type: z.enum(["single_choice", "multiple_choice", "short_answer"]),
  stem: z.string().trim().min(1).max(10_000),
  options: z.array(z.string().trim().min(1)).max(12).optional(),
  answer: z.string().trim().min(1).max(10_000),
  explanation: z.string().trim().max(10_000).default(""),
  points: z.number().positive().max(1_000).default(10)
}).superRefine((question, context) => {
  if (question.type !== "short_answer" && (!question.options || question.options.length < 2)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "选择题至少需要两个选项" });
  } else if (question.type !== "short_answer" && question.options && !isValidChoiceAnswer(question.answer, question.options, question.type === "multiple_choice")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["answer"], message: "标准答案必须对应已有选项" });
  }
});

export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionInputSchema>;

export function questionCreateRows(questions: AssessmentQuestionInput[]) {
  return questions.map((question, index) => {
    const options = question.options ?? [];
    return {
    sourceQuestionId: question.sourceQuestionId ?? null,
    type: question.type,
    stem: question.stem,
    options: question.options ? JSON.stringify(question.options) : null,
    answer: question.type === "short_answer" ? question.answer : normalizeChoiceAnswer(question.answer, options, question.type === "multiple_choice"),
    explanation: question.explanation,
    points: question.points,
    order: index + 1
    };
  });
}

export function parseOptions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
