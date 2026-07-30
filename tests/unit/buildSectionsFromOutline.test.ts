import { describe, expect, it } from "vitest";
import { buildSectionsFromOutline, parseStoredDocumentSections } from "@/lib/imports/documentSections";
import type { GeneratedCourseOutline } from "@/types/course";

const outline: GeneratedCourseOutline = {
  title: "文化市场营销",
  description: "面向学习者的课程说明介绍。",
  targetAudience: "学习者",
  learningObjectives: ["目标一", "目标二", "目标三"],
  chapters: [1, 2].map((c) => ({
    title: `第${c}章 概述`,
    summary: "本章说明。",
    order: c,
    lessons: [1, 2].map((l) => ({
      title: `第${l}节 主题`,
      summary: "本节介绍基础内容。",
      order: l,
      estimatedMinutes: 30,
      keyPoints: ["要点甲", "要点乙"],
      suggestedActivities: ["活动"],
      assessmentPrompts: ["提问"]
    }))
  }))
};

describe("buildSectionsFromOutline", () => {
  it("turns each lesson into a selectable, well-formed section usable as stored sections", () => {
    const sections = buildSectionsFromOutline("doc-1", outline);
    expect(sections).toHaveLength(4);
    expect(sections[0]!.title).toBe("第1章 概述 · 第1节 主题");
    // Titles + key points become the section text used for AI context.
    expect(sections[0]!.text).toContain("要点甲");
    // Every produced section must survive the stored-section validator so the
    // lesson-plan source panel and backend selection accept them.
    const roundTripped = parseStoredDocumentSections(JSON.stringify(sections));
    expect(roundTripped).toHaveLength(4);
    expect(new Set(sections.map((s) => s.id)).size).toBe(4);
  });

  it("falls back to chapter-level sections when a chapter has no lessons", () => {
    const sparse: GeneratedCourseOutline = {
      ...outline,
      chapters: [{ title: "第一章 仅章节", summary: "章节概述内容。", order: 1, lessons: [] }]
    };
    const sections = buildSectionsFromOutline("doc-2", sparse);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe("第一章 仅章节");
  });
});
