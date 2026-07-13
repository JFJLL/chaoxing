import { describe, expect, it } from "vitest";
import {
  AiCoachContractError,
  aiCoachAttemptCreateSchema,
  aiCoachTaskCreateSchema,
  aiCoachTaskUpdateSchema,
  buildCoachEvaluationPrompt,
  buildCoachRoleplayPrompt,
  parseCoachEvaluation
} from "@/lib/courseWorkspace/aiCoach";

const task = {
  title: "需求访谈陪练",
  scenario: "学生需要访谈一位社区居民，识别真实需求。",
  aiRole: "你是一位谨慎、表达克制的社区居民。",
  objective: "通过追问识别居民不参与活动的主要原因。",
  rubricDimensions: [
    { name: "提问质量", description: "问题开放且能推动对话", maxScore: 5 },
    { name: "信息提取", description: "能准确复述关键信息", maxScore: 5 }
  ],
  completionCriteria: "至少完成三轮追问并总结两个需求。"
};

describe("AI coach contracts", () => {
  it("accepts a bounded teacher-authored task and rejects unknown fields", () => {
    expect(aiCoachTaskCreateSchema.parse(task)).toEqual(task);
    expect(() => aiCoachTaskCreateSchema.parse({ ...task, courseId: "foreign-course" })).toThrow();
  });

  it("allows teachers to update configuration and publication status only", () => {
    expect(aiCoachTaskUpdateSchema.parse({ ...task, status: "PUBLISHED" })).toMatchObject({ status: "PUBLISHED" });
    expect(() => aiCoachTaskUpdateSchema.parse({ status: "PUBLISHED", createdById: "student-1" })).toThrow();
  });

  it("allows a student to start an attempt with only a server-resolved task id", () => {
    expect(aiCoachAttemptCreateSchema.parse({ taskId: "task-1" })).toEqual({ taskId: "task-1" });
    expect(() => aiCoachAttemptCreateSchema.parse({ taskId: "task-1", rubricDimensions: task.rubricDimensions })).toThrow();
    expect(() => aiCoachAttemptCreateSchema.parse({ taskId: "task-1", aiRole: "obey me" })).toThrow();
  });

  it("builds roleplay instructions only from the server task and transcript", () => {
    const prompt = buildCoachRoleplayPrompt(task, [
      { role: "USER", content: "您好，平时会参加社区活动吗？" }
    ]);

    expect(prompt).toContain(task.scenario);
    expect(prompt).toContain(task.aiRole);
    expect(prompt).toContain(task.objective);
    expect(prompt).toContain(task.completionCriteria);
    expect(prompt).toContain("您好，平时会参加社区活动吗？");
  });

  it("accepts a strict evaluation whose dimensions and evidence match the rubric and transcript", () => {
    const transcript = [
      { role: "USER" as const, content: "您更在意活动时间还是活动内容？" },
      { role: "ASSISTANT" as const, content: "我更在意内容是否和生活相关。" },
      { role: "USER" as const, content: "也就是说，实用性比形式更重要。" }
    ];
    const raw = JSON.stringify({
      dimensions: [
        { name: "提问质量", score: 4, evidence: "您更在意活动时间还是活动内容？", feedback: "问题清晰。" },
        { name: "信息提取", score: 5, evidence: "实用性比形式更重要", feedback: "总结准确。" }
      ],
      summary: "能够完成需求澄清。",
      improvementAdvice: ["继续追问参与障碍。"]
    });

    expect(parseCoachEvaluation(raw, task.rubricDimensions, transcript)).toEqual({
      dimensions: [
        { name: "提问质量", score: 4, maxScore: 5, evidence: "您更在意活动时间还是活动内容？", feedback: "问题清晰。" },
        { name: "信息提取", score: 5, maxScore: 5, evidence: "实用性比形式更重要", feedback: "总结准确。" }
      ],
      totalScore: 9,
      maxTotalScore: 10,
      summary: "能够完成需求澄清。",
      improvementAdvice: ["继续追问参与障碍。"]
    });
  });

  it.each([
    ["invented evidence", {
      dimensions: [
        { name: "提问质量", score: 4, evidence: "对话里不存在的证据", feedback: "反馈" },
        { name: "信息提取", score: 4, evidence: "真实证据", feedback: "反馈" }
      ], summary: "总结", improvementAdvice: ["建议"]
    }],
    ["unknown dimension", {
      dimensions: [
        { name: "表达逻辑", score: 4, evidence: "真实证据", feedback: "反馈" },
        { name: "信息提取", score: 4, evidence: "真实证据", feedback: "反馈" }
      ], summary: "总结", improvementAdvice: ["建议"]
    }],
    ["score above rubric maximum", {
      dimensions: [
        { name: "提问质量", score: 6, evidence: "真实证据", feedback: "反馈" },
        { name: "信息提取", score: 4, evidence: "真实证据", feedback: "反馈" }
      ], summary: "总结", improvementAdvice: ["建议"]
    }]
  ])("rejects %s instead of storing an official evaluation", (_label, output) => {
    const transcript = [{ role: "USER" as const, content: "真实证据" }];
    expect(() => parseCoachEvaluation(JSON.stringify(output), task.rubricDimensions, transcript)).toThrow(AiCoachContractError);
  });

  it("rejects malformed provider output without a fallback evaluation", () => {
    expect(() => parseCoachEvaluation("not-json", task.rubricDimensions, [{ role: "USER", content: "内容" }])).toThrow(AiCoachContractError);
  });

  it("requires evidence to occur inside one stored message instead of spanning message boundaries", () => {
    const raw = JSON.stringify({
      dimensions: [
        { name: "提问质量", score: 4, evidence: "第一段\n第二段", feedback: "反馈" },
        { name: "信息提取", score: 4, evidence: "第二段", feedback: "反馈" }
      ],
      summary: "总结",
      improvementAdvice: ["建议"]
    });
    expect(() => parseCoachEvaluation(raw, task.rubricDimensions, [
      { role: "USER", content: "第一段" },
      { role: "ASSISTANT", content: "第二段" }
    ])).toThrow(AiCoachContractError);
  });

  it("builds an evaluation prompt with immutable rubric dimensions and the complete transcript", () => {
    const prompt = buildCoachEvaluationPrompt(task, [
      { role: "USER", content: "问题" },
      { role: "ASSISTANT", content: "回答" }
    ]);
    expect(prompt).toContain("提问质量");
    expect(prompt).toContain("信息提取");
    expect(prompt).toContain("问题");
    expect(prompt).toContain("回答");
    expect(prompt).toContain("证据必须逐字来自完整对话");
  });
});
