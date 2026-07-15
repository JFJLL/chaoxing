export type GradableAnswer = {
  type: string;
  answer: string;
  response: string;
  points: number;
};

function normalizeSingle(value: string) {
  return value.trim().toLocaleUpperCase();
}

function normalizeMultiple(value: string) {
  return value
    .split(/[,，;；\s]+/)
    .map(normalizeSingle)
    .filter(Boolean)
    .sort()
    .join(",");
}

export function gradeObjectiveAnswer(input: GradableAnswer) {
  if (input.type === "short_answer") return null;
  const correct = input.type === "multiple_choice"
    ? normalizeMultiple(input.answer) === normalizeMultiple(input.response)
    : normalizeSingle(input.answer) === normalizeSingle(input.response);
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
