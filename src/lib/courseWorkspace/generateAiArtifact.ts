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
  const templates = ["single_choice", "multiple_choice", "short_answer", "single_choice", "short_answer"] as const;

  return {
    questions: templates.map((type, index) => {
      const point = points[index % points.length];
      const id = `q-${index + 1}`;
      if (type === "short_answer") {
        return {
          id,
          type,
          stem: `结合“${point.lesson}”，说明其在《${input.courseTitle}》中的学习价值。`,
          answer: `应围绕${point.chapter}的目标，说明${point.lesson}的概念、场景和应用边界。`,
          explanation: point.summary || "考查学生对课程重点的理解和迁移表达。"
        };
      }

      return {
        id,
        type,
        stem: `关于“${point.lesson}”，下列说法${type === "multiple_choice" ? "正确的有" : "正确的是"}？`,
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

  return {
    objectives: [
      `理解《${input.courseTitle}》的核心知识框架`,
      `能够解释${points[0]?.lesson ?? "课程重点"}的关键概念`,
      "完成一次课堂实践并形成可复盘成果"
    ],
    keyPoints: points.map((point) => `${point.chapter}：${point.lesson}`),
    teachingProcess: [
      { phase: "导入", minutes: 8, activity: `用真实场景引出《${input.courseTitle}》的学习任务` },
      { phase: "讲授", minutes: 22, activity: `围绕${points[0]?.lesson ?? "课程重点"}讲解概念与边界` },
      { phase: "实践", minutes: 25, activity: `分组完成${points[1]?.lesson ?? "课堂练习"}并提交结果` },
      { phase: "总结", minutes: 10, activity: "师生共同整理知识清单和后续任务" }
    ],
    assessment: ["课堂提问完成度", "实践任务提交质量", "学习反思的结构完整性"]
  };
}

function generateCourseware(input: GenerateCourseAiArtifactInput): AiCoursewarePayload {
  const points = learningPoints(input);
  const slides = [
    {
      title: input.courseTitle,
      bullets: ["课程目标", "学习路径", "课堂产出"],
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

  while (slides.length < 6) {
    slides.splice(slides.length - 1, 0, {
      title: `拓展案例 ${slides.length - 1}`,
      bullets: ["场景描述", "操作步骤", "风险边界"],
      speakerNotes: "补充本课程的本地案例。"
    });
  }

  return { slides };
}

function generatePaper(input: GenerateCourseAiArtifactInput): AiPaperPayload {
  return {
    title: `${input.courseTitle} 阶段测验`,
    sections: [
      { name: "单选题", score: 20, questionIds: ["q-1", "q-4"] },
      { name: "多选题", score: 20, questionIds: ["q-2"] },
      { name: "简答题", score: 60, questionIds: ["q-3", "q-5"] }
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
