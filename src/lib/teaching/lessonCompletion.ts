export function weightedLessonCompletionRate(
  lessons: Array<{ id: string; estimatedMinutes: number | null }>,
  completedLessonIds: ReadonlySet<string>
) {
  if (!lessons.length) return null;
  const estimated = lessons.map((lesson) => lesson.estimatedMinutes).filter((value): value is number => Boolean(value && value > 0));
  const fallbackWeight = estimated.length ? estimated.reduce((sum, value) => sum + value, 0) / estimated.length : 1;
  let totalWeight = 0;
  let completedWeight = 0;
  for (const lesson of lessons) {
    const weight = lesson.estimatedMinutes && lesson.estimatedMinutes > 0 ? lesson.estimatedMinutes : fallbackWeight;
    totalWeight += weight;
    if (completedLessonIds.has(lesson.id)) completedWeight += weight;
  }
  return totalWeight > 0 ? Math.round(completedWeight / totalWeight * 100) : null;
}
