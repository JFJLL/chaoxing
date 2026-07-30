import { describe, expect, it } from "vitest";
import { mapImportedOutlineToCourse } from "../../src/lib/imports/mapImportedOutlineToCourse";
import type { CourseDirectoryNode, GeneratedCourseOutline } from "../../src/types/course";

function lesson(title: string) {
  return {
    title,
    summary: `${title}简介`,
    order: 1,
    estimatedMinutes: 45,
    keyPoints: ["知识点"],
    suggestedActivities: ["活动"],
    assessmentPrompts: ["评价"]
  };
}

function outline(chapters: Array<{ title: string; lessons: string[] }>): GeneratedCourseOutline {
  return {
    title: "综合目录",
    description: "综合目录说明与介绍",
    targetAudience: "课程学习者",
    learningObjectives: ["目标一", "目标二", "目标三"],
    chapters: chapters.map((chapter, index) => ({
      title: chapter.title,
      summary: `${chapter.title}简介`,
      order: index + 1,
      lessons: chapter.lessons.map((title) => lesson(title))
    }))
  };
}

function directory(chapters: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }>): CourseDirectoryNode[] {
  return chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    summary: "",
    order: index + 1,
    lessons: chapter.lessons.map((item, lessonIndex) => ({
      id: item.id,
      title: item.title,
      summary: "",
      order: lessonIndex + 1,
      estimatedMinutes: 30,
      keyPoints: [],
      suggestedActivities: [],
      assessmentPrompts: []
    }))
  }));
}

describe("mapImportedOutlineToCourse", () => {
  it("binds a uniquely matching chapter and lesson to their real IDs", () => {
    const current = directory([
      { id: "chapter-real", title: "第一章 概述", lessons: [{ id: "lesson-real", title: "第一课时 导论" }] }
    ]);
    const mapped = mapImportedOutlineToCourse(current, outline([
      { title: "第一章 概述", lessons: ["第一课时 导论"] },
      { title: "第二章 深入", lessons: ["第二课时 案例"] }
    ]));

    expect(mapped.outline.chapters[0]?.id).toBe("chapter-real");
    expect(mapped.outline.chapters[0]?.lessons[0]?.id).toBe("lesson-real");
    expect(mapped.ambiguousTitles).toEqual([]);
  });

  it("assigns temporary IDs to new chapters and lessons that do not match", () => {
    const mapped = mapImportedOutlineToCourse([], outline([
      { title: "全新章节", lessons: ["全新课时"] }
    ]));
    expect(mapped.outline.chapters[0]?.id).toMatch(/^chapter_/);
    expect(mapped.outline.chapters[0]?.lessons[0]?.id).toMatch(/^lesson_/);
  });

  it("never binds by position when a title appears more than once", () => {
    const current = directory([
      { id: "chapter-a", title: "重复章节", lessons: [] },
      { id: "chapter-b", title: "重复章节", lessons: [] }
    ]);
    const mapped = mapImportedOutlineToCourse(current, outline([
      { title: "重复章节", lessons: ["课时"] },
      { title: "另一章", lessons: ["课时二"] }
    ]));
    expect(mapped.outline.chapters[0]?.id).toMatch(/^chapter_/);
    expect(mapped.ambiguousTitles).toContain("重复章节");
  });

  it("only matches lessons inside the chapter that was matched", () => {
    const current = directory([
      { id: "chapter-real", title: "第一章", lessons: [{ id: "lesson-real", title: "共享课时" }] },
      { id: "chapter-other", title: "第二章", lessons: [{ id: "lesson-other", title: "共享课时" }] }
    ]);
    const mapped = mapImportedOutlineToCourse(current, outline([
      { title: "第一章", lessons: ["共享课时"] }
    ]));
    // Bound to the matched chapter's lesson, not the same-titled lesson elsewhere.
    expect(mapped.outline.chapters[0]?.lessons[0]?.id).toBe("lesson-real");
  });
});
