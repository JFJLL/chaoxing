import { db } from "@/lib/db";
import { parseOptions, type AssessmentQuestionInput } from "@/lib/teaching/assessmentInput";
import { normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export async function loadSourceQuestionInputs(courseId: string, ids: string[]): Promise<AssessmentQuestionInput[]> {
  if (!ids.length) return [];
  const rows = await db.courseQuestion.findMany({
    where: { courseId, id: { in: ids }, status: "APPROVED" },
    select: { id: true, type: true, stem: true, options: true, answer: true, explanation: true }
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => {
    const options = parseOptions(row.options);
    return {
    sourceQuestionId: row.id,
    type: row.type as AssessmentQuestionInput["type"],
    stem: row.stem,
    options: options.length ? options : undefined,
    answer: row.type === "short_answer" ? row.answer : normalizeChoiceAnswer(row.answer, options, row.type === "multiple_choice"),
    explanation: row.explanation,
    points: 10
    };
  });
}
