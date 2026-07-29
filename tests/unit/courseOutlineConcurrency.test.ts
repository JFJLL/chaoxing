import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { applyOutlineToCourse, CourseOutlineConflictError } from "../../src/lib/imports/applyOutline";
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
});
