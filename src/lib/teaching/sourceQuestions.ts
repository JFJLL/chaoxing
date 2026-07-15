import { db } from "@/lib/db";
import type { AssessmentQuestionInput } from "@/lib/teaching/assessmentInput";

export async function loadSourceQuestionInputs(courseId: string, ids: string[]): Promise<AssessmentQuestionInput[]> {
  if (!ids.length) return [];
  const rows = await db.courseQuestion.findMany({
    where: { courseId, id: { in: ids }, status: "APPROVED" },
    select: { id: true, type: true, stem: true, options: true, answer: true, explanation: true }
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => ({
    sourceQuestionId: row.id,
    type: row.type as AssessmentQuestionInput["type"],
    stem: row.stem,
    options: row.options ? JSON.parse(row.options) as string[] : undefined,
    answer: row.answer,
    explanation: row.explanation,
    points: 10
  }));
}
