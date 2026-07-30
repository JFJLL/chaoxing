import type { CourseDirectoryNode, GeneratedCourseOutline } from "@/types/course";

type OutlineLesson = GeneratedCourseOutline["chapters"][number]["lessons"][number];
type OutlineChapter = GeneratedCourseOutline["chapters"][number];

export type MappedOutlineLesson = OutlineLesson & { id?: string };
export type MappedOutlineChapter = Omit<OutlineChapter, "lessons"> & {
  id?: string;
  lessons: MappedOutlineLesson[];
};

export type MappedCourseOutline = Omit<GeneratedCourseOutline, "chapters"> & {
  chapters: MappedOutlineChapter[];
};

export type MapImportedOutlineResult = {
  outline: MappedCourseOutline;
  /**
   * Titles that matched more than one existing chapter/lesson. These are left
   * with a temporary ID (creating a fresh record) instead of guessing which
   * existing item they belong to, and are surfaced so the UI can warn the
   * teacher to confirm manually from the maintenance page.
   */
  ambiguousTitles: string[];
};

function normalizedTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

/**
 * Maps a freshly generated import outline onto the course's existing formal
 * directory, binding real chapter/lesson IDs when a unique normalized-title
 * match exists. Unmatched items receive temporary IDs (`chapter_*`/`lesson_*`)
 * so the persistence layer creates new records; duplicated titles are never
 * bound by position and are reported for manual confirmation.
 */
export function mapImportedOutlineToCourse(
  currentDirectory: CourseDirectoryNode[],
  generatedOutline: GeneratedCourseOutline
): MapImportedOutlineResult {
  const ambiguousTitles: string[] = [];
  const usedChapterIds = new Set<string>();

  const chapters = generatedOutline.chapters.map((chapter, chapterIndex) => {
    const chapterMatches = currentDirectory.filter(
      (candidate) => !usedChapterIds.has(candidate.id) && normalizedTitle(candidate.title) === normalizedTitle(chapter.title)
    );

    let boundChapter: CourseDirectoryNode | undefined;
    let chapterId: string;
    if (chapterMatches.length === 1) {
      boundChapter = chapterMatches[0];
      chapterId = boundChapter!.id;
      usedChapterIds.add(chapterId);
    } else {
      if (chapterMatches.length > 1) ambiguousTitles.push(chapter.title);
      chapterId = `chapter_${chapterIndex}`;
    }

    const usedLessonIds = new Set<string>();
    const lessons = chapter.lessons.map((lesson, lessonIndex): MappedOutlineLesson => {
      if (!boundChapter) {
        return { ...lesson, id: `lesson_${chapterIndex}_${lessonIndex}` };
      }
      const lessonMatches = boundChapter.lessons.filter(
        (candidate) => !usedLessonIds.has(candidate.id) && normalizedTitle(candidate.title) === normalizedTitle(lesson.title)
      );
      if (lessonMatches.length === 1) {
        usedLessonIds.add(lessonMatches[0]!.id);
        return { ...lesson, id: lessonMatches[0]!.id };
      }
      if (lessonMatches.length > 1) ambiguousTitles.push(lesson.title);
      return { ...lesson, id: `lesson_${chapterIndex}_${lessonIndex}` };
    });

    return { ...chapter, id: chapterId, lessons };
  });

  return {
    outline: { ...generatedOutline, chapters },
    ambiguousTitles
  };
}
