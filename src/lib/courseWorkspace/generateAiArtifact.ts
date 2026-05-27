import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload,
  CourseAiAppType,
  CourseAiArtifactPayload
} from "@/types/courseWorkspace";

type ChapterInput = {
  title: string;
  lessons: Array<{ title: string; summary?: string | null }>;
};

export type GenerateCourseAiArtifactInput = {
  appType: CourseAiAppType;
  courseTitle: string;
  chapters: ChapterInput[];
  prompt?: string;
};

function optionNumber(prompt: string | undefined, label: string, fallback: number, min: number, max: number) {
  const match = prompt?.match(new RegExp(`${label}[:：]\\s*(\\d+)`));
  const value = match ? Number(match[1]) : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function optionText(prompt: string | undefined, label: string, fallback: string) {
  const match = prompt?.match(new RegExp(`${label}[:：]\\s*([^；;\\n]+)`));
  return match?.[1]?.trim() || fallback;
}

function learningPoints(input: GenerateCourseAiArtifactInput) {
  const fromLessons = input.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      chapter: chapter.title,
      lesson: lesson.title,
      summary: lesson.summary
    }))
  );

  if (fromLessons.length) return fromLessons;

  return [
    { chapter: input.courseTitle, lesson: "课程导入", summary: input.prompt || "理解课程核心概念" },
    { chapter: input.courseTitle, lesson: "重点讲解", summary: "梳理关键知识点" },
    { chapter: input.courseTitle, lesson: "实践应用", summary: "完成课堂练习与迁移应用" }
  ];
}

function generateQuestions(input: GenerateCourseAiArtifactInput): AiQuestionPayload {
  const points = learningPoints(input);
  const questionCount = optionNumber(input.prompt, "题量", 5, 3, 12);
  const difficulty = optionText(input.prompt, "难度", "基础");
  const requestedType = optionText(input.prompt, "题型", "混合");
  const templatePool = ["single_choice", "multiple_choice", "short_answer"] as const;
  const templates = Array.from({ length: questionCount }, (_, index) => {
    if (requestedType.includes("单选")) return "single_choice";
    if (requestedType.includes("多选")) return "multiple_choice";
    if (requestedType.includes("简答")) return "short_answer";
    return templatePool[index % templatePool.length];
  });

  return {
    questions: templates.map((type, index) => {
      const point = points[index % points.length];
      const id = `q-${index + 1}`;
      if (type === "short_answer") {
        return {
          id,
          type,
          stem: `结合“${point.lesson}”，说明其在《${input.courseTitle}》中的学习价值，并体现${difficulty}层级要求。`,
          answer: `应围绕${point.chapter}的目标，说明${point.lesson}的概念、场景和应用边界。`,
          explanation: point.summary || "考查学生对课程重点的理解和迁移表达。"
        };
      }

      return {
        id,
        type,
        stem: `关于“${point.lesson}”（${difficulty}），下列说法${type === "multiple_choice" ? "正确的有" : "正确的是"}？`,
        options: [
          `它属于${point.chapter}的学习内容`,
          "它与本课程没有关系",
          "它只能通过线下讲授完成",
          "它可以结合资料和任务点进行学习"
        ],
        answer: type === "multiple_choice" ? "A、D" : "A",
        explanation: point.summary || `题目围绕${point.chapter}中的${point.lesson}生成。`
      };
    })
  };
}

function generateLessonPlan(input: GenerateCourseAiArtifactInput): AiLessonPlanPayload {
  const points = learningPoints(input).slice(0, 4);
  const totalMinutes = optionNumber(input.prompt, "课时", 65, 30, 180);
  const method = optionText(input.prompt, "教法", "讲授结合实践");
  const practiceMinutes = Math.max(10, Math.round(totalMinutes * 0.38));
  const lectureMinutes = Math.max(10, Math.round(totalMinutes * 0.34));
  const introMinutes = Math.max(5, Math.round(totalMinutes * 0.12));
  const summaryMinutes = Math.max(5, totalMinutes - introMinutes - lectureMinutes - practiceMinutes);

  return {
    objectives: [
      `理解《${input.courseTitle}》的核心知识框架`,
      `能够解释${points[0]?.lesson ?? "课程重点"}的关键概念`,
      "完成一次课堂实践并形成可复盘成果"
    ],
    keyPoints: points.map((point) => `${point.chapter}：${point.lesson}`),
    teachingProcess: [
      { phase: "导入", minutes: introMinutes, activity: `用真实场景引出《${input.courseTitle}》的学习任务` },
      { phase: "讲授", minutes: lectureMinutes, activity: `采用${method}，围绕${points[0]?.lesson ?? "课程重点"}讲解概念与边界` },
      { phase: "实践", minutes: practiceMinutes, activity: `分组完成${points[1]?.lesson ?? "课堂练习"}并提交结果` },
      { phase: "总结", minutes: summaryMinutes, activity: "师生共同整理知识清单和后续任务" }
    ],
    assessment: ["课堂提问完成度", "实践任务提交质量", "学习反思的结构完整性"]
  };
}

function generateCourseware(input: GenerateCourseAiArtifactInput): AiCoursewarePayload {
  const points = learningPoints(input);
  const slideCount = optionNumber(input.prompt, "页数", 6, 5, 16);
  const style = optionText(input.prompt, "风格", "课堂讲授");
  const slides = [
    {
      title: input.courseTitle,
      bullets: ["课程目标", "学习路径", `${style}风格`],
      speakerNotes: "说明本节课的目标和预期成果。"
    },
    ...points.slice(0, 4).map((point) => ({
      title: point.lesson,
      bullets: [point.chapter, point.summary || "关键概念梳理", "课堂应用提示"],
      speakerNotes: `讲解${point.lesson}，并结合${point.chapter}安排提问。`
    })),
    {
      title: "总结与任务",
      bullets: ["知识回顾", "任务点检查", "课后延展"],
      speakerNotes: "回收课堂反馈，明确课后任务。"
    }
  ];

  while (slides.length < slideCount) {
    slides.splice(slides.length - 1, 0, {
      title: `拓展案例 ${slides.length - 1}`,
      bullets: ["场景描述", "操作步骤", "风险边界"],
      speakerNotes: "补充本课程的本地案例。"
    });
  }

  return { slides };
}

function generatePaper(input: GenerateCourseAiArtifactInput): AiPaperPayload {
  const totalScore = optionNumber(input.prompt, "总分", 100, 30, 150);
  const difficulty = optionText(input.prompt, "难度", "综合");
  const singleScore = Math.round(totalScore * 0.25);
  const multipleScore = Math.round(totalScore * 0.25);
  const shortScore = totalScore - singleScore - multipleScore;

  return {
    title: `${input.courseTitle} ${difficulty}阶段测验`,
    sections: [
      { name: "单选题", score: singleScore, questionIds: ["q-1", "q-4"] },
      { name: "多选题", score: multipleScore, questionIds: ["q-2"] },
      { name: "简答题", score: shortScore, questionIds: ["q-3", "q-5"] }
    ]
  };
}

export function generateCourseAiArtifact(input: GenerateCourseAiArtifactInput): CourseAiArtifactPayload {
  switch (input.appType) {
    case "question_generation":
      return generateQuestions(input);
    case "lesson_plan":
      return generateLessonPlan(input);
    case "courseware":
      return generateCourseware(input);
    case "paper_assembly":
      return generatePaper(input);
    default: {
      const exhaustive: never = input.appType;
      throw new Error(`不支持的 AI 应用类型：${exhaustive}`);
    }
  }
}
