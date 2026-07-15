import { normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export type GradableAnswer = {
  type: string;
  answer: string;
  response: string;
  points: number;
  options?: string[];
};

export function gradeObjectiveAnswer(input: GradableAnswer) {
  if (input.type === "short_answer") return null;
  const multiple = input.type === "multiple_choice";
  const options = input.options ?? [];
  const correct = normalizeChoiceAnswer(input.answer, options, multiple)
    === normalizeChoiceAnswer(input.response, options, multiple);
  return correct ? input.points : 0;
}

export function summarizeObjectiveGrades(answers: GradableAnswer[]) {
  let score = 0;
  let autoGradedPoints = 0;
  let pendingManualCount = 0;
  for (const answer of answers) {
    const graded = gradeObjectiveAnswer(answer);
    if (graded === null) {
      pendingManualCount += 1;
      continue;
    }
    score += graded;
    autoGradedPoints += answer.points;
  }
  return { score, autoGradedPoints, pendingManualCount };
}
