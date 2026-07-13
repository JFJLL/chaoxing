import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiCoach, type AiCoachAttemptDto, type AiCoachTaskDto } from "@/components/course-workspace/AiCoach";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const task: AiCoachTaskDto = {
  id: "task-1",
  courseId: "course-1",
  createdById: "teacher-1",
  title: "真实需求访谈",
  scenario: "访谈社区居民",
  aiRole: "社区居民",
  objective: "识别需求",
  rubricDimensions: [{ name: "提问质量", description: "开放提问", maxScore: 5 }],
  completionCriteria: "完成三轮",
  status: "PUBLISHED",
  version: 1,
  publishedAt: "2026-07-13T00:00:00.000Z",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

const attempt: AiCoachAttemptDto = {
  id: "attempt-1",
  courseId: "course-1",
  userId: "student-1",
  kind: "COACH",
  status: "ACTIVE",
  title: task.title,
  evaluation: null,
  evaluationStatus: "PENDING",
  completedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  task,
  messages: [
    { id: "u-1", role: "USER", content: "这是数据库里的真实学生消息", createdAt: "2026-07-13T00:00:00.000Z" },
    { id: "a-1", role: "ASSISTANT", content: "这是模型完整返回后保存的消息", createdAt: "2026-07-13T00:00:01.000Z" }
  ]
};

describe("AI coach UI", () => {
  it("renders teacher task authoring and real attempt review without demo labels", () => {
    const html = renderToStaticMarkup(
      <AiCoach courseId="course-1" currentUserId="teacher-1" canManage initialTasks={[task]} initialAttempts={[attempt]} />
    );
    expect(html).toContain("创建陪练任务");
    expect(html).toContain("任务管理");
    expect(html).toContain("学生练习记录");
    expect(html).toContain("真实需求访谈");
    expect(html).not.toContain("前端展示");
    expect(html).not.toContain("当前示例");
  });

  it("renders only server-provided published tasks and persistent conversation for a student", () => {
    const html = renderToStaticMarkup(
      <AiCoach courseId="course-1" currentUserId="student-1" canManage={false} initialTasks={[task]} initialAttempts={[attempt]} />
    );
    expect(html).toContain("开始新练习");
    expect(html).toContain("这是数据库里的真实学生消息");
    expect(html).toContain("这是模型完整返回后保存的消息");
    expect(html).toContain("结束并生成评价");
    expect(html).not.toContain("创建陪练任务");
  });

  it("shows explicit retry actions for failed dialogue and evaluation with no template answer", () => {
    const dialogueHtml = renderToStaticMarkup(
      <AiCoach
        courseId="course-1"
        currentUserId="student-1"
        canManage={false}
        initialTasks={[task]}
        initialAttempts={[{ ...attempt, evaluationStatus: "FAILED", messages: [attempt.messages[0]!] }]}
        initialDialogueFailure={{ attemptId: "attempt-1", retryMessageId: "u-1", error: "AI 调用失败，请重试" }}
      />
    );
    const evaluationHtml = renderToStaticMarkup(
      <AiCoach
        courseId="course-1"
        currentUserId="student-1"
        canManage={false}
        initialTasks={[task]}
        initialAttempts={[{ ...attempt, evaluationStatus: "FAILED" }]}
      />
    );
    expect(dialogueHtml).toContain("AI 调用失败，请重试");
    expect(dialogueHtml).toContain("重试本轮对话");
    expect(evaluationHtml).toContain("重试生成评价");
    expect(dialogueHtml + evaluationHtml).not.toContain("使用示例回答");
    expect(dialogueHtml + evaluationHtml).not.toContain("本地模板");
  });

  it("does not offer evaluation while the latest student turn has no complete assistant response", () => {
    const html = renderToStaticMarkup(
      <AiCoach
        courseId="course-1"
        currentUserId="student-1"
        canManage={false}
        initialTasks={[task]}
        initialAttempts={[{
          ...attempt,
          evaluationStatus: "FAILED",
          messages: [...attempt.messages, { id: "u-2", role: "USER", content: "尚未回答", createdAt: "2026-07-13T00:00:02.000Z" }]
        }]}
      />
    );
    expect(html).not.toContain("重试生成评价");
    expect(html).not.toContain("结束并生成评价");
  });

  it("keeps older attempt history reachable through an explicit load-more action", () => {
    const html = renderToStaticMarkup(
      <AiCoach
        courseId="course-1"
        currentUserId="student-1"
        canManage={false}
        initialTasks={[task]}
        initialAttempts={[attempt]}
        initialNextCursor="attempt-1"
      />
    );
    expect(html).toContain("加载更多记录");
  });
});
