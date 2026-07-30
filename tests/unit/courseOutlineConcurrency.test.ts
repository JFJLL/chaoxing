import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import {
  applyOutlineToCourse,
  CourseOutlineConflictError,
  CourseOutlineSyncError
} from "../../src/lib/imports/applyOutline";
import type { GeneratedCourseOutline } from "../../src/types/course";

const institutionIds: string[] = [];

function outline(title: string): GeneratedCourseOutline {
  return {
    title,
    description: `${title}的课程说明与综合介绍`,
    targetAudience: "课程学习者",
    learningObjectives: ["理解基本概念", "掌握核心方法", "完成综合实践"],
    chapters: [1, 2, 3].map((order) => ({
      title: `${title} 第${order}章`, summary: `第${order}章简介`, order,
      lessons: [{
        title: `课时 ${order}`, summary: `课时 ${order} 简介`, order: 1, estimatedMinutes: 45,
        keyPoints: ["知识点"], suggestedActivities: ["课堂活动"], assessmentPrompts: ["评价问题"]
      }]
    }))
  };
}

afterEach(async () => {
  await db.institution.deleteMany({ where: { id: { in: institutionIds.splice(0) } } });
});

describe("course outline optimistic locking", () => {
  it("rejects a stale second save without overwriting the first teacher's directory", async () => {
    const institution = await db.institution.create({ data: { name: `目录并发 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({
      data: { name: "目录教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id }
    });
    const course = await db.course.create({ data: { title: "目录课程", ownerId: owner.id, institutionId: institution.id } });

    await applyOutlineToCourse({ courseId: course.id, outline: outline("第一版"), expectedOutlineVersion: 0, actorId: owner.id });
    await expect(applyOutlineToCourse({
      courseId: course.id, outline: outline("过期版本"), expectedOutlineVersion: 0, actorId: owner.id
    })).rejects.toBeInstanceOf(CourseOutlineConflictError);

    const persisted = await db.course.findUniqueOrThrow({
      where: { id: course.id }, include: { chapters: { orderBy: { order: "asc" } } }
    });
    expect(persisted.outlineVersion).toBe(1);
    expect(persisted.chapters.map((chapter) => chapter.title)).toEqual(["第一版 第1章", "第一版 第2章", "第一版 第3章"]);
  });

  it("preserves persisted chapter and lesson IDs while updating content and order", async () => {
    const institution = await db.institution.create({ data: { name: `目录增量 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({
      data: { name: "增量目录教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id }
    });
    const course = await db.course.create({ data: { title: "增量目录课程", ownerId: owner.id, institutionId: institution.id } });
    const initial = await applyOutlineToCourse({ courseId: course.id, outline: outline("初始"), expectedOutlineVersion: 0, actorId: owner.id });
    const firstChapter = initial.chapters[0]!;
    const firstLesson = firstChapter.lessons[0]!;

    const edited = structuredClone(initial.chapters);
    edited[0]!.title = "已编辑章节";
    edited[0]!.lessons[0]!.title = "已编辑课时";
    edited[0]!.lessons[0]!.keyPoints = ["保留真实关联", "增量保存"];
    const saved = await applyOutlineToCourse({
      courseId: course.id,
      outline: { chapters: edited },
      expectedOutlineVersion: 1,
      actorId: owner.id
    });

    expect(saved.chapters[0]?.id).toBe(firstChapter.id);
    expect(saved.chapters[0]?.lessons[0]?.id).toBe(firstLesson.id);
    expect(saved.chapters[0]?.title).toBe("已编辑章节");
    expect(saved.chapters[0]?.lessons[0]?.keyPoints).toEqual(["保留真实关联", "增量保存"]);
  });

  it("rejects deleting a referenced lesson and rolls the optimistic version back", async () => {
    const institution = await db.institution.create({ data: { name: `目录引用 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({
      data: { name: "引用目录教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id }
    });
    const student = await db.user.create({
      data: { name: "目录学生", email: `${randomUUID()}@outline.test`, role: "STUDENT", institutionId: institution.id }
    });
    const course = await db.course.create({ data: { title: "引用目录课程", ownerId: owner.id, institutionId: institution.id } });
    const initial = await applyOutlineToCourse({ courseId: course.id, outline: outline("引用"), expectedOutlineVersion: 0, actorId: owner.id });
    const referencedLesson = initial.chapters[0]!.lessons[0]!;
    await db.resource.create({ data: { courseId: course.id, lessonId: referencedLesson.id, title: "课时资料", type: "document" } });
    await db.note.create({ data: { ownerId: student.id, courseId: course.id, lessonId: referencedLesson.id, title: "课时笔记", body: "不能丢失" } });
    await db.lessonProgress.create({ data: { userId: student.id, lessonId: referencedLesson.id, completedAt: new Date() } });
    const withoutReferencedLesson = structuredClone(initial.chapters);
    withoutReferencedLesson[0]!.lessons = [];

    await expect(applyOutlineToCourse({
      courseId: course.id,
      outline: { chapters: withoutReferencedLesson },
      expectedOutlineVersion: 1,
      actorId: owner.id
    })).rejects.toMatchObject({ code: "COURSE_OUTLINE_ITEM_REFERENCED" } satisfies Partial<CourseOutlineSyncError>);

    const persisted = await db.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(persisted.outlineVersion).toBe(1);
    expect(await db.lesson.findUnique({ where: { id: referencedLesson.id } })).not.toBeNull();
  });

  it("returns real persisted IDs for newly added temporary nodes", async () => {
    const institution = await db.institution.create({ data: { name: `目录新增 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({
      data: { name: "新增目录教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id }
    });
    const course = await db.course.create({ data: { title: "新增目录课程", ownerId: owner.id, institutionId: institution.id } });
    const generated = outline("新增");
    const created = await applyOutlineToCourse({
      courseId: course.id,
      outline: {
        ...generated,
        chapters: generated.chapters.map((chapter, index) => ({
          ...chapter,
          id: `chapter_temp_${index}`,
          lessons: chapter.lessons.map((lesson) => ({ ...lesson, id: `lesson_temp_${index}` }))
        }))
      },
      expectedOutlineVersion: 0,
      actorId: owner.id
    });

    expect(created.chapters.every((chapter) => !chapter.id.startsWith("chapter_"))).toBe(true);
    expect(created.chapters.flatMap((chapter) => chapter.lessons).every((lesson) => !lesson.id.startsWith("lesson_"))).toBe(true);
  });

 it("protects a referenced old lesson from deletion instead of silently rebinding by order", async () => {
    const institution = await db.institution.create({ data: { name: `目录错绑 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({ data: { name: "错绑教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id } });
    const course = await db.course.create({ data: { title: "错绑课程", ownerId: owner.id, institutionId: institution.id } });
    const initial = await applyOutlineToCourse({ courseId: course.id, outline: outline("代数"), expectedOutlineVersion: 0, actorId: owner.id });
    const oldLessonId = initial.chapters[0]!.lessons[0]!.id;
    await db.resource.create({ data: { courseId: course.id, lessonId: oldLessonId, title: "代数资料", type: "document" } });

    // A completely different outline (no matching IDs) must not silently rebind
    // by order; the referenced old lesson becomes a delete candidate and the
    // reference guard rejects the save without touching the persisted lesson.
    await expect(applyOutlineToCourse({
      courseId: course.id,
      outline: outline("二战史"),
      expectedOutlineVersion: 1,
      actorId: owner.id
    })).rejects.toMatchObject({ code: "COURSE_OUTLINE_ITEM_REFERENCED" });
    expect((await db.lesson.findUniqueOrThrow({ where: { id: oldLessonId } })).title).toBe("课时 1");
    expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).outlineVersion).toBe(1);
  });

  it("saves a first outline onto an empty course", async () => {
    const institution = await db.institution.create({ data: { name: `目录首次 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({ data: { name: "首次教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id } });
    const course = await db.course.create({ data: { title: "首次课程", ownerId: owner.id, institutionId: institution.id } });

    const created = await applyOutlineToCourse({ courseId: course.id, outline: outline("首次"), expectedOutlineVersion: 0, actorId: owner.id });
    expect(created.outlineVersion).toBe(1);
    expect(created.chapters).toHaveLength(3);
    expect(await db.chapter.count({ where: { courseId: course.id } })).toBe(3);
  });

  it("replaces an unreferenced directory with a differently named outline instead of blocking", async () => {
    const institution = await db.institution.create({ data: { name: `目录替换 ${randomUUID()}` } });
    institutionIds.push(institution.id);
    const owner = await db.user.create({ data: { name: "替换教师", email: `${randomUUID()}@outline.test`, role: "TEACHER", institutionId: institution.id } });
    const course = await db.course.create({ data: { title: "替换课程", ownerId: owner.id, institutionId: institution.id } });

    await applyOutlineToCourse({ courseId: course.id, outline: outline("旧版"), expectedOutlineVersion: 0, actorId: owner.id });
    // A differently named outline with no references must not raise a mapping
    // error; unreferenced old items are safely deleted and new ones created.
    const saved = await applyOutlineToCourse({ courseId: course.id, outline: outline("新版"), expectedOutlineVersion: 1, actorId: owner.id });
    expect(saved.chapters.map((chapter) => chapter.title)).toEqual(["新版 第1章", "新版 第2章", "新版 第3章"]);
    expect(await db.chapter.count({ where: { courseId: course.id } })).toBe(3);
    expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).outlineVersion).toBe(2);
  });
});
