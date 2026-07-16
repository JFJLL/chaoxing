type CountDimension = { completed: number; total: number };

function rate(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

export function buildLearningIndicators(input: {
  lessons: CountDimension;
  attendance: { present: number; total: number };
  assignments: { submitted: number; total: number };
  exams: { gradedScore: number; gradedMaxScore: number };
}) {
  return {
    lessonCompletionRate: rate(input.lessons.completed, input.lessons.total),
    attendanceRate: rate(input.attendance.present, input.attendance.total),
    assignmentCompletionRate: rate(input.assignments.submitted, input.assignments.total),
    examAverageRate: rate(input.exams.gradedScore, input.exams.gradedMaxScore)
  };
}
